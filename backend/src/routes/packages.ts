import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { MIN_ACCOUNT_HASH_LENGTH } from "../config.js";
import { getAllTasks } from "../services/downloadManager.js";
import { getIdParam } from "../utils/route.js";
import type { PackageInfo } from "../types/index.js";

const router = Router();

// Sanitize filename for Content-Disposition to prevent header injection
function sanitizeFilename(name: string): string {
  // Remove control characters, quotes, backslashes, and non-ASCII
  return name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/[\r\n]/g, "")
    .slice(0, 200);
}

// List packages filtered by account hashes
router.get("/packages", (req: Request, res: Response) => {
  const hashesParam = req.query.accountHashes;
  if (!hashesParam || typeof hashesParam !== "string") {
    res.json([]);
    return;
  }
  const hashes = new Set(hashesParam.split(",").filter(Boolean));
  if (hashes.size === 0) {
    res.json([]);
    return;
  }

  const packages: Omit<PackageInfo, "filePath">[] = [];
  const completedTasks = getAllTasks().filter(
    (t) => t.status === "completed" && t.filePath && hashes.has(t.accountHash),
  );

  for (const task of completedTasks) {
    if (!task.filePath || !fs.existsSync(task.filePath)) continue;

    const stats = fs.statSync(task.filePath);
    packages.push({
      id: task.id,
      software: task.software,
      accountHash: task.accountHash,
      fileSize: stats.size,
      createdAt: task.createdAt,
    });
  }

  res.json(packages);
});

// Stream IPA file (requires accountHash)
router.get("/packages/:id/file", (req: Request, res: Response) => {
  const accountHash = req.query.accountHash as string;
  if (!accountHash || accountHash.length < MIN_ACCOUNT_HASH_LENGTH) {
    res.status(400).json({ error: "Missing or invalid accountHash" });
    return;
  }

  const id = getIdParam(req);
  const task = getAllTasks().find(
    (t) => t.id === id && t.status === "completed",
  );

  if (!task || !task.filePath || !fs.existsSync(task.filePath)) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  if (task.accountHash !== accountHash) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Verify file path is within packages directory
  const packagesBase = path.resolve(path.join(config.dataDir, "packages"));
  const resolvedPath = path.resolve(task.filePath);
  if (!resolvedPath.startsWith(packagesBase + path.sep)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const safeName = sanitizeFilename(task.software.name);
  const safeVersion = sanitizeFilename(task.software.version);
  const fileName = `${safeName}_${safeVersion}.ipa`;
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Type", "application/octet-stream");

  const stats = fs.statSync(resolvedPath);
  res.setHeader("Content-Length", stats.size);

  const stream = fs.createReadStream(resolvedPath);
  stream.pipe(res);
});

// Delete a package (requires accountHash)
router.delete("/packages/:id", (req: Request, res: Response) => {
  const accountHash = req.query.accountHash as string;
  if (!accountHash || accountHash.length < MIN_ACCOUNT_HASH_LENGTH) {
    res.status(400).json({ error: "Missing or invalid accountHash" });
    return;
  }

  const id = getIdParam(req);
  const packagesDir = path.join(config.dataDir, "packages");
  const packagesBase = path.resolve(packagesDir);

  const task = getAllTasks().find((t) => t.id === id);
  if (!task || !task.filePath) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  if (task.accountHash !== accountHash) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Verify file path is within packages directory
  const resolvedPath = path.resolve(task.filePath);
  if (!resolvedPath.startsWith(packagesBase + path.sep)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);

    // Clean up empty parent directories
    let dir = path.dirname(resolvedPath);
    while (dir !== packagesBase && dir.startsWith(packagesBase)) {
      const contents = fs.readdirSync(dir);
      if (contents.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    }
  }

  res.json({ success: true });
});

export default router;
