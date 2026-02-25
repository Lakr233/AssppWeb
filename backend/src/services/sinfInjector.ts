import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import bplistParser from "bplist-parser";
import bplistCreator from "bplist-creator";
import plist from "plist";
import type { Sinf } from "../types/index.js";

const execFile = promisify(execFileCb);

export async function inject(
  sinfs: Sinf[],
  ipaPath: string,
  iTunesMetadata?: string,
): Promise<void> {
  const entries = await listEntries(ipaPath);
  const bundleName = readBundleName(entries);

  // Collect all files to inject
  const filesToInject: { entryPath: string; data: Buffer }[] = [];

  const manifest = await readManifestPlist(ipaPath, entries);
  if (manifest) {
    for (let i = 0; i < manifest.sinfPaths.length; i++) {
      if (i >= sinfs.length) continue;
      const sinfPath = manifest.sinfPaths[i];
      const fullPath = `Payload/${bundleName}.app/${sinfPath}`;
      filesToInject.push({
        entryPath: fullPath,
        data: Buffer.from(sinfs[i].sinf, "base64"),
      });
    }
  } else {
    const info = await readInfoPlist(ipaPath, entries);
    if (info) {
      if (sinfs.length > 0) {
        const sinfPath = `Payload/${bundleName}.app/SC_Info/${info.bundleExecutable}.sinf`;
        filesToInject.push({
          entryPath: sinfPath,
          data: Buffer.from(sinfs[0].sinf, "base64"),
        });
      }
    } else {
      throw new Error("Could not read manifest or info plist");
    }
  }

  // Inject iTunesMetadata.plist at the archive root if provided
  // Frontend sends base64-encoded XML plist; convert to binary plist
  // to match Apple's native format (PropertyListSerialization .binary)
  if (iTunesMetadata) {
    const xmlBuffer = Buffer.from(iTunesMetadata, "base64");
    const xmlString = xmlBuffer.toString("utf-8");
    let metadataBuffer: Buffer;
    try {
      const parsed = plist.parse(xmlString);
      metadataBuffer = bplistCreator(parsed as Record<string, unknown>);
    } catch {
      metadataBuffer = xmlBuffer;
    }
    filesToInject.push({
      entryPath: "iTunesMetadata.plist",
      data: metadataBuffer,
    });
  }

  if (filesToInject.length > 0) {
    await addFilesToZip(ipaPath, filesToInject);
  }
}

async function listEntries(ipaPath: string): Promise<string[]> {
  const { stdout } = await execFile("unzip", ["-l", "--", ipaPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  // unzip -l output format:
  //   Length      Date    Time    Name
  //   ---------  ---------- -----   ----
  //        1234  2024-01-01 00:00   Payload/App.app/file
  //   ---------                     -------
  const lines = stdout.split("\n");
  const entries: string[] = [];
  for (const line of lines) {
    // Match lines with file entries (has length, date, time, name)
    const match = line.match(
      /^\s*\d+\s+\d{2}-\d{2}-\d{2,4}\s+\d{2}:\d{2}\s+(.+)$/,
    );
    if (match) {
      entries.push(match[1].trim());
    }
  }
  return entries;
}

async function readEntry(ipaPath: string, entryPath: string): Promise<Buffer> {
  // "--" prevents entryPath from being interpreted as flags
  const { stdout } = await execFile("unzip", ["-p", "--", ipaPath, entryPath], {
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function addFilesToZip(
  ipaPath: string,
  files: { entryPath: string; data: Buffer }[],
): Promise<void> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sinf-"));
  const resolvedTmpDir = path.resolve(tmpDir);
  try {
    // Write files to temp dir preserving ZIP path structure
    const relativePaths: string[] = [];
    for (const file of files) {
      // Guard against path traversal from IPA-derived entry paths
      const fullPath = path.resolve(tmpDir, file.entryPath);
      if (!fullPath.startsWith(resolvedTmpDir + path.sep)) {
        throw new Error(`Path traversal detected in entry: ${file.entryPath}`);
      }
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, file.data);
      relativePaths.push(file.entryPath);
    }

    // Use zip to update the archive in-place
    // -0: store without compression (SINF/plist files are tiny)
    // "--" after archive name prevents file args from being parsed as flags
    await execFile("zip", ["-0", ipaPath, "--", ...relativePaths], {
      cwd: tmpDir,
      maxBuffer: 1024 * 1024,
    });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

function readBundleName(entries: string[]): string {
  for (const entryPath of entries) {
    if (
      entryPath.includes(".app/Info.plist") &&
      !entryPath.includes("/Watch/")
    ) {
      const components = entryPath.split("/");
      for (let i = 0; i < components.length; i++) {
        if (components[i].endsWith(".app")) {
          return components[i].replace(".app", "");
        }
      }
    }
  }
  throw new Error("Could not read bundle name");
}

function parsePlistBuffer(data: Buffer): Record<string, unknown> | null {
  // Try binary plist first
  try {
    const parsed = bplistParser.parseBuffer(data);
    if (parsed && parsed.length > 0) {
      return parsed[0] as Record<string, unknown>;
    }
  } catch {
    // Not binary plist, try XML
  }

  // Try XML plist
  try {
    const xml = data.toString("utf-8");
    if (xml.includes("<?xml") || xml.includes("<plist")) {
      const parsed = plist.parse(xml);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    }
  } catch {
    // Not valid XML plist either
  }

  return null;
}

async function readManifestPlist(
  ipaPath: string,
  entries: string[],
): Promise<{ sinfPaths: string[] } | null> {
  for (const entryPath of entries) {
    if (entryPath.endsWith(".app/SC_Info/Manifest.plist")) {
      const data = await readEntry(ipaPath, entryPath);
      const parsed = parsePlistBuffer(data);
      if (parsed) {
        const sinfPaths = parsed["SinfPaths"];
        if (Array.isArray(sinfPaths)) {
          return { sinfPaths: sinfPaths as string[] };
        }
      }
      return null;
    }
  }
  return null;
}

async function readInfoPlist(
  ipaPath: string,
  entries: string[],
): Promise<{ bundleExecutable: string } | null> {
  for (const entryPath of entries) {
    if (
      entryPath.includes(".app/Info.plist") &&
      !entryPath.includes("/Watch/")
    ) {
      const data = await readEntry(ipaPath, entryPath);
      const parsed = parsePlistBuffer(data);
      if (parsed) {
        const executable = parsed["CFBundleExecutable"];
        if (typeof executable === "string") {
          return { bundleExecutable: executable };
        }
      }
      return null;
    }
  }
  return null;
}
