import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import {
  DOWNLOAD_THREADS,
  CHUNK_RETRY_COUNT,
  CHUNK_RETRY_DELAY_MS,
  MAX_DOWNLOAD_SIZE,
} from "../config.js";

interface ChunkRange {
  index: number;
  start: number;
  end: number; // inclusive
}

interface ProgressInfo {
  downloaded: number;
  total: number;
  speed: string;
}

type ProgressCallback = (info: ProgressInfo) => void;

/**
 * Multi-threaded HTTP downloader using Range requests.
 * Falls back to single-stream when the server doesn't support Range.
 */
export class ChunkedDownloader {
  private readonly url: string;
  private readonly destPath: string;
  private readonly threads: number;
  private readonly onProgress?: ProgressCallback;

  private abortControllers = new Set<AbortController>();
  private aborted = false;
  private chunkBytes: number[] = [];
  private totalSize = 0;
  private lastProgressTime = 0;
  private lastProgressBytes = 0;

  constructor(
    url: string,
    destPath: string,
    options?: { threads?: number; onProgress?: ProgressCallback },
  ) {
    this.url = url;
    this.destPath = destPath;
    this.threads = options?.threads ?? DOWNLOAD_THREADS;
    this.onProgress = options?.onProgress;
  }

  /** Probe the server for Range support and content length. */
  private async probe(signal: AbortSignal): Promise<{
    supportsRange: boolean;
    contentLength: number;
  }> {
    const res = await fetch(this.url, {
      method: "HEAD",
      signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HEAD failed: HTTP ${res.status}`);
    }

    const acceptRanges = res.headers.get("accept-ranges");
    const contentLength = parseInt(
      res.headers.get("content-length") || "0",
      10,
    );
    const supportsRange = acceptRanges === "bytes" && contentLength > 0;

    return { supportsRange, contentLength };
  }

  /** Split total size into chunk ranges. */
  private splitChunks(totalSize: number): ChunkRange[] {
    const chunkSize = Math.ceil(totalSize / this.threads);
    const chunks: ChunkRange[] = [];
    for (let i = 0; i < this.threads; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, totalSize - 1);
      if (start > totalSize - 1) break;
      chunks.push({ index: i, start, end });
    }
    return chunks;
  }

  /** Download a single chunk with retries, writing to a .part file. */
  private async downloadChunk(
    chunk: ChunkRange,
    signal: AbortSignal,
  ): Promise<void> {
    const partPath = `${this.destPath}.part${chunk.index}`;
    const expectedBytes = chunk.end - chunk.start + 1;
    let lastErr: Error | undefined;

    for (let attempt = 0; attempt < CHUNK_RETRY_COUNT; attempt++) {
      if (this.aborted) throw new Error("Aborted");

      const ac = new AbortController();
      this.abortControllers.add(ac);
      const onAbort = () => ac.abort();
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        const res = await fetch(this.url, {
          signal: ac.signal,
          redirect: "follow",
          headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
        });

        if (res.status !== 206 && res.status !== 200) {
          throw new Error(`Chunk ${chunk.index}: HTTP ${res.status}`);
        }
        if (!res.body) {
          throw new Error(`Chunk ${chunk.index}: no body`);
        }

        const ws = fs.createWriteStream(partPath);
        const reader = res.body.getReader();
        const chunkBytesRef = this.chunkBytes;
        const chunkIndex = chunk.index;
        let chunkDownloaded = 0;

        const readable = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
                return;
              }
              chunkDownloaded += value.byteLength;
              if (chunkDownloaded > expectedBytes * 2) {
                this.destroy(
                  new Error(`Chunk ${chunkIndex}: exceeded expected size`),
                );
                return;
              }
              chunkBytesRef[chunkIndex] = chunkDownloaded;
              this.push(Buffer.from(value));
            } catch (err) {
              this.destroy(err instanceof Error ? err : new Error(String(err)));
            }
          },
        });

        await pipeline(readable, ws);
        return; // success
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (lastErr.name === "AbortError" || this.aborted) throw lastErr;
        if (attempt < CHUNK_RETRY_COUNT - 1) {
          await new Promise((r) => setTimeout(r, CHUNK_RETRY_DELAY_MS));
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
        this.abortControllers.delete(ac);
      }
    }

    throw lastErr ?? new Error(`Chunk ${chunk.index} failed after retries`);
  }

  /** Merge all .part files into the final destination. */
  private async mergeChunks(chunkCount: number): Promise<void> {
    const ws = fs.createWriteStream(this.destPath);
    for (let i = 0; i < chunkCount; i++) {
      const partPath = `${this.destPath}.part${i}`;
      const rs = fs.createReadStream(partPath);
      await pipeline(rs, ws, { end: false });
    }
    ws.end();
    await new Promise<void>((resolve, reject) => {
      ws.on("finish", resolve);
      ws.on("error", reject);
    });

    this.cleanPartFiles(chunkCount);
  }

  /** Remove .part temporary files. */
  private cleanPartFiles(chunkCount: number): void {
    for (let i = 0; i < chunkCount; i++) {
      const partPath = `${this.destPath}.part${i}`;
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {
        // best-effort cleanup
      }
    }
  }

  /** Single-stream fallback download. */
  private async downloadSingleStream(signal: AbortSignal): Promise<void> {
    const res = await fetch(this.url, { signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    if (!res.body) throw new Error("No response body");

    const contentLength = parseInt(
      res.headers.get("content-length") || "0",
      10,
    );
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${contentLength} bytes exceeds ${MAX_DOWNLOAD_SIZE} byte limit`,
      );
    }

    this.totalSize = contentLength;
    let downloaded = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    const ws = fs.createWriteStream(this.destPath);
    const reader = res.body.getReader();

    const readable = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
            return;
          }
          downloaded += value.byteLength;
          if (downloaded > MAX_DOWNLOAD_SIZE) {
            this.destroy(new Error("Download exceeded maximum size"));
            return;
          }
          this.push(Buffer.from(value));
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });

    const progressInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTime;
      if (elapsed >= 500) {
        const bytesPerSec = ((downloaded - lastBytes) / elapsed) * 1000;
        lastTime = now;
        lastBytes = downloaded;
        this.onProgress?.({
          downloaded,
          total: this.totalSize,
          speed: formatSpeed(bytesPerSec),
        });
      }
    }, 500);

    try {
      await pipeline(readable, ws);
    } finally {
      clearInterval(progressInterval);
    }

    this.onProgress?.({ downloaded, total: this.totalSize, speed: "0 B/s" });
  }

  /**
   * Execute the download.
   * Probes for Range support, then either downloads in parallel chunks
   * or falls back to single-stream.
   */
  async download(signal: AbortSignal): Promise<void> {
    let supportsRange = false;
    let contentLength = 0;
    try {
      const probeResult = await this.probe(signal);
      supportsRange = probeResult.supportsRange;
      contentLength = probeResult.contentLength;
    } catch {
      // HEAD failed — fall back to single-stream
    }

    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `File too large: ${contentLength} bytes exceeds ${MAX_DOWNLOAD_SIZE} byte limit`,
      );
    }

    if (!supportsRange || this.threads <= 1) {
      await this.downloadSingleStream(signal);
      return;
    }

    this.totalSize = contentLength;
    const chunks = this.splitChunks(contentLength);
    this.chunkBytes = new Array(chunks.length).fill(0);

    this.lastProgressTime = Date.now();
    this.lastProgressBytes = 0;
    const progressInterval = setInterval(() => {
      const now = Date.now();
      const totalDownloaded = this.chunkBytes.reduce((a, b) => a + b, 0);
      const elapsed = now - this.lastProgressTime;

      let speed = "0 B/s";
      if (elapsed > 0) {
        const bytesPerSec =
          ((totalDownloaded - this.lastProgressBytes) / elapsed) * 1000;
        speed = formatSpeed(bytesPerSec);
      }
      this.lastProgressTime = now;
      this.lastProgressBytes = totalDownloaded;

      this.onProgress?.({
        downloaded: totalDownloaded,
        total: this.totalSize,
        speed,
      });
    }, 500);

    try {
      await Promise.all(
        chunks.map((chunk) => this.downloadChunk(chunk, signal)),
      );

      clearInterval(progressInterval);
      await this.mergeChunks(chunks.length);

      this.onProgress?.({
        downloaded: this.totalSize,
        total: this.totalSize,
        speed: "0 B/s",
      });
    } catch (err) {
      clearInterval(progressInterval);
      this.cleanPartFiles(chunks.length);
      throw err;
    }
  }

  /** Abort all active connections and clean up temporary files. */
  abort(): void {
    this.aborted = true;
    for (const ac of this.abortControllers) {
      try {
        ac.abort();
      } catch {
        // ignore
      }
    }
    this.abortControllers.clear();

    // Clean up any .part files by scanning directory
    try {
      const dir = path.dirname(this.destPath);
      const base = path.basename(this.destPath);
      if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir)) {
          if (entry.startsWith(base + ".part")) {
            try {
              fs.unlinkSync(path.join(dir, entry));
            } catch {
              // best-effort
            }
          }
        }
      }
    } catch {
      // best-effort cleanup
    }
  }
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}
