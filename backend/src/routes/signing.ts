import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";
import {
  config,
  MAX_DOWNLOAD_SIZE,
  MIN_ACCOUNT_HASH_LENGTH,
} from "../config.js";
import {
  encodePathSegment,
  registerUploadedTask,
  sanitizeTaskForResponse,
} from "../services/downloadManager.js";
import type { Software } from "../types/index.js";

const router = Router();
const PACKAGES_DIR = path.join(config.dataDir, "packages");

function getQueryString(req: Request, key: string): string {
  const value = req.query[key];
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return typeof value === "string" ? value : "";
}

function buildUploadedSoftware(
  bundleID: string,
  name: string,
  version: string,
): Software {
  const now = new Date().toISOString();
  return {
    id: 0,
    bundleID,
    name,
    version,
    artistName: "Local Signed IPA",
    sellerName: "Local Signed IPA",
    description: "Uploaded from signing workflow",
    averageUserRating: 0,
    userRatingCount: 0,
    artworkUrl: "",
    screenshotUrls: [],
    minimumOsVersion: "",
    releaseDate: now,
    primaryGenreName: "Utilities",
  };
}

async function writeRequestToFile(req: Request, filePath: string) {
  let writtenBytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      const chunkBytes = Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk, encoding);
      writtenBytes += chunkBytes;
      if (writtenBytes > MAX_DOWNLOAD_SIZE) {
        callback(new Error("Uploaded file is too large"));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(req, limiter, fs.createWriteStream(filePath, { flags: "wx" }));

  if (writtenBytes === 0) {
    throw new Error("Uploaded file is empty");
  }
}

router.post("/signing/upload", async (req: Request, res: Response) => {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/octet-stream")) {
    res.status(415).json({ error: "Content-Type must be application/octet-stream" });
    return;
  }

  const declaredLength = parseInt(req.headers["content-length"] || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_SIZE) {
    res.status(413).json({ error: "Uploaded file exceeds maximum size limit" });
    return;
  }

  let accountHash: string;
  let bundleID: string;
  let version: string;
  let appName: string;

  try {
    accountHash = encodePathSegment(
      getQueryString(req, "accountHash"),
      "accountHash",
      MIN_ACCOUNT_HASH_LENGTH,
    );
    bundleID = encodePathSegment(getQueryString(req, "bundleID"), "bundleID");
    version = encodePathSegment(
      getQueryString(req, "version") || "1.0.0",
      "version",
    );

    const rawName = getQueryString(req, "name").trim() || "Signed IPA";
    appName = rawName.slice(0, 120);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid upload params",
    });
    return;
  }

  const uploadId = uuidv4();
  const targetDir = path.join(PACKAGES_DIR, accountHash, bundleID, version);
  const resolvedDir = path.resolve(targetDir);
  const packagesBase = path.resolve(PACKAGES_DIR);
  if (!resolvedDir.startsWith(packagesBase + path.sep)) {
    res.status(400).json({ error: "Invalid upload path" });
    return;
  }

  fs.mkdirSync(resolvedDir, { recursive: true });
  const tempPath = path.join(resolvedDir, `${uploadId}.part`);
  const finalPath = path.join(resolvedDir, `${uploadId}.ipa`);

  try {
    await writeRequestToFile(req, tempPath);
    fs.renameSync(tempPath, finalPath);

    const software = buildUploadedSoftware(bundleID, appName, version);
    const task = registerUploadedTask(software, accountHash, finalPath, uploadId);

    res.status(201).json(sanitizeTaskForResponse(task));
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
    } catch {
      // Best effort cleanup
    }

    const message = err instanceof Error ? err.message : "Upload failed";
    const isTooLarge = message.toLowerCase().includes("too large");
    res.status(isTooLarge ? 413 : 500).json({ error: message });
  }
});

export default router;
