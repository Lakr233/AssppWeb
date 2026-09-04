// SAP asset extraction service.
//
// Apple's SAP signer runs four binaries extracted from a public OS X 10.9
// software update package on swcdn.apple.com. The backend downloads the
// package's xar Payload once via HTTP range requests, decompresses the bzip2
// stream from a fixed offset, and pulls the four files out of the cpio
// archive — verifying each against its pinned SHA-256 digest before caching
// them under DATA_DIR/sap-assets. All data is public Apple content; no
// credentials are involved at any point.
//
// Wire format details mirror ipatool's internal/sap/assets (and the
// extraction pipeline verified against the pinned digests on 2026-09-02).

import https from "node:https";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { config } from "../config.js";

const UPDATE_URL =
  "https://swcdn.apple.com/content/downloads/27/34/041-98128-A_SYPWICN3KH/5dqkl4rqgbsr18yzy61yeie9g3cmjc5hiv/OSXUpd10.9.pkg";
const BZ2_OFFSET = 0x352f40d5;
const CPIO_SKIP = 0x3a4;
const XAR_HEADER_SIZE = 28;

export interface SapAssetSpec {
  name: string;
  /** Path inside the cpio archive. */
  archivePath: string;
  /** Original Apple file: size + digest verify the extraction itself. */
  size: number;
  sha256: string;
  /**
   * Distributed file: fat binaries are stripped to their x86_64 slice (the
   * emulated guest architecture) before caching, halving CoreFP. The
   * stripped digest is a deterministic function of the original — the
   * extraction still only accepts bytes matching the Apple digest above.
   */
  strippedSize: number;
  strippedSha256: string;
}

export const SAP_ASSET_SPECS: SapAssetSpec[] = [
  {
    name: "CommerceKit",
    archivePath:
      "./System/Library/PrivateFrameworks/CommerceKit.framework/Versions/A/CommerceKit",
    size: 3271840,
    sha256: "b84ff12c21987856c0a17b78f1ad82b73195a6dec5f3b208a17d245555a2c8a2",
    // Thin x86_64 image; no fat wrapper to strip.
    strippedSize: 3271840,
    strippedSha256:
      "b84ff12c21987856c0a17b78f1ad82b73195a6dec5f3b208a17d245555a2c8a2",
  },
  {
    name: "CommerceCore",
    archivePath:
      "./System/Library/PrivateFrameworks/CommerceKit.framework/Versions/A/Frameworks/CommerceCore.framework/Versions/A/CommerceCore",
    size: 207744,
    sha256: "c5401e57402230f3c876409d295319ddf1e61287bc882683c5d61277be7bc1f2",
    strippedSize: 115712,
    strippedSha256:
      "05707cd937798f2b5189471f513672ac6242ffbffc38f06ed2e4fb4345156819",
  },
  {
    name: "CoreFP",
    archivePath:
      "./System/Library/PrivateFrameworks/CoreFP.framework/Versions/A/CoreFP",
    size: 29014912,
    sha256: "f19141336be4198d0f8991bb00017c915efc7aeaece36c345f7faa1237ea6074",
    strippedSize: 14904192,
    strippedSha256:
      "97c899f2fb076bdf7f810fe00ceb335d4af85efab0f2de737ad0aedd991c8277",
  },
  {
    name: "CoreFP.icxs",
    archivePath:
      "./System/Library/PrivateFrameworks/CoreFP.framework/Versions/A/CoreFP.icxs",
    size: 5288352,
    sha256: "473e78af86979f5bd4f6269561caf770b3d16c098d918846eeac8cdd2fe6566a",
    // FairPlay data blob; no architecture slices.
    strippedSize: 5288352,
    strippedSha256:
      "473e78af86979f5bd4f6269561caf770b3d16c098d918846eeac8cdd2fe6566a",
  },
];

export type SapAssetsState =
  | { status: "idle" }
  | {
      status: "extracting";
      progress: number;
      downloadedBytes: number;
      totalBytes: number;
    }
  | { status: "ready" }
  | { status: "error"; error: string };

let state: SapAssetsState = { status: "idle" };
let extraction: Promise<void> | null = null;

export function sapAssetsState(): SapAssetsState {
  return state;
}

function cacheDir(): string {
  return path.join(config.dataDir, "sap-assets");
}

function assetPath(name: string): string {
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    throw new Error("unknown SAP asset");
  }
  return path.join(cacheDir(), spec.name);
}

export async function readCachedAsset(name: string): Promise<Buffer | null> {
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    return null;
  }
  try {
    const data = await fs.readFile(assetPath(name));
    return verifyStripped(spec, data) ? data : null;
  } catch {
    return null;
  }
}

function verifyStripped(spec: SapAssetSpec, data: Buffer): boolean {
  if (data.length !== spec.strippedSize) {
    return false;
  }
  return (
    createHash("sha256").update(data).digest("hex") === spec.strippedSha256
  );
}

/**
 * Extracts the x86_64 slice from a fat (universal) Mach-O, returning the
 * input untouched for thin images and non-Mach-O data. Mirrors the browser's
 * amd64Slice in frontend/src/apple/sap/machImage.ts.
 */
function stripToX86_64(data: Buffer): Buffer {
  if (data.length < 8) {
    return data;
  }
  const magic = data.readUInt32BE(0);
  if (magic !== 0xcafebabe && magic !== 0xcafebabf) {
    return data;
  }
  const wide = magic === 0xcafebabf;
  const count = data.readUInt32BE(4);
  const entrySize = wide ? 32 : 20;
  for (let index = 0; index < count; index++) {
    const entry = 8 + index * entrySize;
    const cputype = data.readInt32BE(entry);
    if (cputype !== 0x01000007) {
      continue; // x86_64
    }
    const offset = wide
      ? Number(data.readBigUInt64BE(entry + 8))
      : data.readUInt32BE(entry + 8);
    const size = wide
      ? Number(data.readBigUInt64BE(entry + 16))
      : data.readUInt32BE(entry + 12);
    if (offset + size > data.length) {
      throw new Error("x86_64 slice exceeds input size");
    }
    return data.subarray(offset, offset + size);
  }
  return data;
}

/**
 * Directory of assets prebaked into the container image (see Dockerfile).
 * When present, a fresh volume is seeded from it without any network use.
 */
export function bundledSapAssetsDir(): string {
  return process.env.BUNDLED_SAP_ASSETS ?? "/opt/asspp/sap-assets";
}

/** Ensures assets are extracted and cached; concurrent callers share the job. */
export async function ensureSapAssets(): Promise<void> {
  for (const spec of SAP_ASSET_SPECS) {
    if (!(await readCachedAsset(spec.name))) {
      if (await seedFromBundled()) {
        break;
      }
      await extract();
      return;
    }
  }
  state = { status: "ready" };
}

async function seedFromBundled(): Promise<boolean> {
  const bundled = bundledSapAssetsDir();
  let any = false;
  try {
    await fs.access(bundled);
  } catch {
    return false;
  }
  for (const spec of SAP_ASSET_SPECS) {
    if (await readCachedAsset(spec.name)) {
      continue;
    }
    try {
      const data = await fs.readFile(path.join(bundled, spec.name));
      if (!verifyStripped(spec, data)) {
        continue;
      }
      await fs.mkdir(cacheDir(), { recursive: true });
      const target = assetPath(spec.name);
      await fs.writeFile(`${target}.tmp`, data);
      await fs.rename(`${target}.tmp`, target);
      any = true;
    } catch {
      // bundled file missing/corrupt; fall through to extraction
    }
  }
  return any;
}

async function extract(): Promise<void> {
  if (extraction) {
    return extraction;
  }
  extraction = runExtraction().finally(() => {
    extraction = null;
  });
  return extraction;
}

async function runExtraction(): Promise<void> {
  state = { status: "extracting", progress: 0, downloadedBytes: 0, totalBytes: 0 };

  try {
    const location = await locatePayload();
    const streamStart = location.heapOffset + BZ2_OFFSET;
    const totalBytes = location.length - BZ2_OFFSET;
    state = { status: "extracting", progress: 0, downloadedBytes: 0, totalBytes };

    await fs.mkdir(cacheDir(), { recursive: true });

    const results = new Map<string, Buffer>();
    const wanted = new Map<string, (data: Buffer) => void>();
    for (const spec of SAP_ASSET_SPECS) {
      wanted.set(spec.archivePath, (data) => results.set(spec.name, data));
    }

    let allFoundResolve: (() => void) | null = null;
    const allFound = new Promise<void>((resolve) => {
      allFoundResolve = resolve;
    });
    const skipper = new SkipStream(CPIO_SKIP);
    const extractor = new CpioExtractor(wanted, () => allFoundResolve?.());

    let downloadedBytes = 0;
    const cdnStream = rangeStream(streamStart, streamStart + totalBytes, (bytes) => {
      downloadedBytes += bytes;
      if (state.status === "extracting") {
        state.downloadedBytes = downloadedBytes;
        state.progress = Math.min(0.95, downloadedBytes / totalBytes);
      }
    });

    // unbzip2-stream pulls a native crc32 accelerator as a transitive
    // dependency; cross-built images (buildx BUILDPLATFORM stages) may not
    // carry a binary matching the runtime architecture. Load it lazily so
    // images with prebaked assets never touch this path.
    let decompress: () => import("through").ThroughStream;
    try {
      decompress = (await import("unbzip2-stream")).default;
    } catch {
      throw new Error(
        "SAP network extraction unavailable on this image (bzip2 decoder missing); " +
          "use a prebaked release image or mount assets via BUNDLED_SAP_ASSETS",
      );
    }

    // "BZh9" + the raw tail reconstructs the bz2 member the same way the
    // reference implementation does. The prepended header must be a real
    // byte stream (Readables concatenated as values would corrupt it).
    const bz2Stream = new PrependStream(Buffer.from("BZh9", "latin1"), cdnStream);
    const pipeline = bz2Stream.pipe(decompress()).pipe(skipper).pipe(extractor);

    const finished = new Promise<void>((resolve, reject) => {
      pipeline.on("finish", () => resolve());
      pipeline.on("error", (error: Error) => reject(error));
    });

    // The extractor resolves as soon as the last wanted member is captured;
    // racing it against the stream end aborts the download early. The bz2
    // stream is truncated mid-file (the package heap contains other data
    // after it), so the decoder may emit a late crc error once the wanted
    // members are already captured — that must never surface as an
    // unhandled rejection, which crashes Node outright.
    finished.catch(() => undefined);
    await Promise.race([
      allFound,
      finished.then(() => {
        if (results.size !== SAP_ASSET_SPECS.length) {
          throw new Error(
            `extraction found ${results.size}/${SAP_ASSET_SPECS.length} assets`,
          );
        }
      }),
    ]).finally(() => {
      for (const segment of [extractor, skipper, bz2Stream, cdnStream]) {
        segment.removeAllListeners("error");
        segment.on("error", () => undefined);
        segment.destroy();
      }
    });

    if (results.size !== SAP_ASSET_SPECS.length) {
      throw new Error(
        `extraction found ${results.size}/${SAP_ASSET_SPECS.length} assets`,
      );
    }

    for (const spec of SAP_ASSET_SPECS) {
      const original = results.get(spec.name)!;
      if (original.length !== spec.size) {
        throw new Error(`asset ${spec.name} has unexpected size`);
      }
      const digest = createHash("sha256").update(original).digest("hex");
      if (digest !== spec.sha256) {
        throw new Error(`asset ${spec.name} failed integrity verification`);
      }

      const stripped = stripToX86_64(original);
      if (!verifyStripped(spec, stripped)) {
        throw new Error(`asset ${spec.name} failed post-strip verification`);
      }
      const target = assetPath(spec.name);
      await fs.writeFile(`${target}.tmp`, stripped);
      await fs.rename(`${target}.tmp`, target);
    }

    state = { status: "ready" };
  } catch (error) {
    state = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }
}

function httpsGetRange(url: string, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { Range: `bytes=${start}-${end}` } },
      (response) => {
        if (response.statusCode !== 206) {
          request.destroy();
          reject(new Error(`CDN returned ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

async function locatePayload(): Promise<{ heapOffset: number; length: number }> {
  const headerAndToc = await httpsGetRange(UPDATE_URL, 0, 64 * 1024 - 1);
  if (headerAndToc.subarray(0, 4).toString("latin1") !== "xar!") {
    throw new Error("update package is not a xar archive");
  }
  const tocLength = Number(headerAndToc.readBigUInt64BE(8));
  const toc = zlib
    .inflateSync(headerAndToc.subarray(XAR_HEADER_SIZE, XAR_HEADER_SIZE + tocLength))
    .toString("utf8");

  const blocks = toc
    .split(/<file\b/)
    .filter((block) => /<name>Payload<\/name>/.test(block));
  if (blocks.length !== 1) {
    throw new Error("payload entry not found in xar TOC");
  }
  const offsetMatch = blocks[0].match(/<offset>(0x[0-9a-f]+|\d+)<\/offset>/);
  const lengthMatch = blocks[0].match(/<length>(0x[0-9a-f]+|\d+)<\/length>/);
  if (!offsetMatch || !lengthMatch) {
    throw new Error("payload extent not found in xar TOC");
  }
  return {
    heapOffset: XAR_HEADER_SIZE + tocLength + Number(offsetMatch[1]),
    length: Number(lengthMatch[1]),
  };
}

/** A source stream that emits `prefix` before piping through `source`. */
class PrependStream extends Readable {
  private prefixPending: Buffer | null;
  private sourcePiped = false;

  constructor(
    prefix: Buffer,
    private readonly source: Readable,
  ) {
    super();
    this.prefixPending = prefix;
  }

  _read(): void {
    if (this.prefixPending) {
      const chunk = this.prefixPending;
      this.prefixPending = null;
      if (!this.push(chunk)) {
        return;
      }
    }
    if (!this.sourcePiped) {
      this.sourcePiped = true;
      this.source.on("data", (chunk: Buffer) => {
        if (!this.push(chunk)) {
          this.source.pause();
        }
      });
      this.source.on("end", () => this.push(null));
      this.source.on("error", (error: Error) => this.destroy(error));
      return;
    }
    this.source.resume();
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.source.destroy();
    callback(error);
  }
}

/** Streams bytes [start, end) from the CDN in sequential range requests. */
function rangeStream(
  start: number,
  end: number,
  onChunk?: (bytes: number) => void,
): Readable {
  const chunkSize = 16 << 20;
  let offset = start;
  let pending: Promise<Buffer> | null = null;

  return new Readable({
    async read() {
      try {
        for (;;) {
          if (offset >= end) {
            this.push(null);
            return;
          }
          if (!pending) {
            const from = offset;
            const to = Math.min(from + chunkSize, end) - 1;
            pending = httpsGetRange(UPDATE_URL, from, to).then((buffer) => {
              offset = to + 1;
              onChunk?.(buffer.length);
              return buffer;
            });
          }
          const buffer = await pending;
          pending = null;
          if (!this.push(buffer)) {
            return;
          }
        }
      } catch (error) {
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}

/** Drops the first `count` bytes of the stream. */
class SkipStream extends Transform {
  private skipped = 0;

  constructor(private readonly count: number) {
    super();
  }

  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    if (this.skipped < this.count) {
      const remaining = this.count - this.skipped;
      if (chunk.length <= remaining) {
        this.skipped += chunk.length;
        callback(null);
        return;
      }
      this.skipped = this.count;
      callback(null, chunk.subarray(remaining));
      return;
    }
    callback(null, chunk);
  }
}

/**
 * Parses cpio members (odc "070707" and newc "070701" formats) and captures
 * the wanted files. macOS package payloads historically use the portable
 * ASCII odc format: 76-byte headers, octal text fields, no padding.
 */
class CpioExtractor extends Transform {
  private buffer: Buffer = Buffer.alloc(0);
  private found = 0;
  private format: "odc" | "newc" | null = null;

  constructor(
    private readonly wanted: Map<string, (data: Buffer) => void>,
    private readonly onAllFound: () => void,
  ) {
    super();
  }

  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      while (this.parseOne()) {
        if (this.found === this.wanted.size) {
          this.onAllFound();
          this.push(null);
          callback(null);
          return;
        }
      }
      callback(null);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Parses one member if the buffer holds it completely. */
  private parseOne(): boolean {
    if (this.buffer.length < 6) {
      return false;
    }
    const magic = this.buffer.subarray(0, 6).toString("latin1");
    if (!this.format) {
      if (magic === "070707") {
        this.format = "odc";
      } else if (magic === "070701") {
        this.format = "newc";
      } else {
        throw new Error(`unexpected cpio magic: ${magic}`);
      }
    }

    if (this.format === "odc") {
      return this.parseOdc();
    }
    return this.parseNewc();
  }

  /** odc: 76-byte header, octal ASCII fields, name and data unpadded. */
  private parseOdc(): boolean {
    const HEADER_SIZE = 76;
    if (this.buffer.length < HEADER_SIZE) {
      return false;
    }
    const octal = (start: number, length: number): number =>
      parseInt(this.buffer.subarray(start, start + length).toString("latin1"), 8);

    const nameSize = octal(59, 6);
    const fileSize = octal(65, 11);
    const nameEnd = HEADER_SIZE + nameSize - 1;
    if (this.buffer.length < nameEnd + 1) {
      return false;
    }
    const name = this.buffer.subarray(HEADER_SIZE, nameEnd).toString("latin1");
    const dataStart = HEADER_SIZE + nameSize;
    const dataEnd = dataStart + fileSize;
    if (this.buffer.length < dataEnd) {
      return false;
    }

    const handler = this.wanted.get(name);
    if (handler) {
      handler(this.buffer.subarray(dataStart, dataEnd));
      this.found += 1;
    }
    this.buffer = this.buffer.subarray(dataEnd);
    return name !== "TRAILER!!!";
  }

  /** newc: 110-byte header, hex ASCII fields, 4-byte alignment. */
  private parseNewc(): boolean {
    const HEADER_SIZE = 110;
    if (this.buffer.length < HEADER_SIZE) {
      return false;
    }
    const field = (offset: number): number =>
      parseInt(
        this.buffer.subarray(offset, offset + 8).toString("latin1"),
        16,
      );

    const fileSize = field(54);
    const nameSize = field(94);
    const nameEnd = HEADER_SIZE + nameSize - 1;
    if (this.buffer.length < nameEnd + 1) {
      return false;
    }
    const name = this.buffer
      .subarray(HEADER_SIZE, nameEnd)
      .toString("latin1");
    const dataStart = Math.ceil((HEADER_SIZE + nameSize) / 4) * 4;
    const dataEnd = dataStart + fileSize;
    if (this.buffer.length < dataEnd) {
      return false;
    }

    const handler = this.wanted.get(name);
    if (handler) {
      handler(this.buffer.subarray(dataStart, dataEnd));
      this.found += 1;
    }
    this.buffer = this.buffer.subarray(
      dataStart + Math.ceil(fileSize / 4) * 4,
    );
    return name !== "TRAILER!!!";
  }
}
