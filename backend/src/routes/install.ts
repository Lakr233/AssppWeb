import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { getAllTasks } from "../services/downloadManager.js";
import { buildManifest, getWhitePng } from "../services/manifestBuilder.js";
import { getIdParam } from "../utils/route.js";

const router = Router();

export function getBaseUrl(req: Request): string {
  const configured = normalizeBaseUrl(config.publicBaseUrl);
  if (configured) return configured;

  // Trust x-forwarded-proto for protocol (safe — only affects URL scheme)
  // but use host header directly (not x-forwarded-host) to prevent open redirects
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto === "https" || req.secure ? "https" : "http";
  const host = req.headers["host"] || "localhost";

  // Validate host header to prevent injection
  const sanitizedHost = host.replace(/[^\w.\-:]/g, "");

  // Support X-Forwarded-Port for reverse proxies that strip port from Host header.
  // Common when deploying HTTPS on non-443 ports (e.g., nginx with $host instead of $http_host).
  // Without this, manifest plist URLs default to port 443 and iOS cannot fetch the payload.
  if (!sanitizedHost.includes(":")) {
    const forwardedPort = req.headers["x-forwarded-port"];
    if (typeof forwardedPort === "string") {
      const port = forwardedPort.replace(/\D/g, "");
      const isDefault =
        (proto === "https" && port === "443") ||
        (proto === "http" && port === "80");
      if (port && !isDefault) {
        return `${proto}://${sanitizedHost}:${port}`;
      }
    }
  }

  return `${proto}://${sanitizedHost}`;
}

function normalizeBaseUrl(value?: string): string {
  if (!value) return "";
  return value.trim().replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  return `${base}/${suffix}`;
}

// Manifest plist for iTMS installation
router.get("/install/:id/manifest.plist", (req: Request, res: Response) => {
  const id = getIdParam(req);
  const task = getAllTasks().find(
    (t) => t.id === id && t.status === "completed",
  );

  if (!task || !task.filePath) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const payloadUrl = joinUrl(baseUrl, `/api/install/${id}/payload.ipa`);
  const smallIconUrl = joinUrl(baseUrl, `/api/install/${id}/icon-small.png`);
  const largeIconUrl = joinUrl(baseUrl, `/api/install/${id}/icon-large.png`);

  const manifest = buildManifest(
    task.software,
    payloadUrl,
    smallIconUrl,
    largeIconUrl,
  );

  res.setHeader("Content-Type", "application/xml");
  res.send(manifest);
});

router.get("/install/:id/url", (req: Request, res: Response) => {
  const id = getIdParam(req);
  const task = getAllTasks().find(
    (t) => t.id === id && t.status === "completed",
  );

  if (!task || !task.filePath) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const manifestUrl = joinUrl(baseUrl, `/api/install/${id}/manifest.plist`);
  const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(
    manifestUrl,
  )}`;

  res.json({ installUrl, manifestUrl });
});

// Stream IPA payload for installation
router.get("/install/:id/payload.ipa", (req: Request, res: Response) => {
  const id = getIdParam(req);
  const task = getAllTasks().find(
    (t) => t.id === id && t.status === "completed",
  );

  if (!task || !task.filePath || !fs.existsSync(task.filePath)) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  // Verify file path is within packages directory
  const packagesBase = path.resolve(path.join(config.dataDir, "packages"));
  const resolvedPath = path.resolve(task.filePath);
  if (!resolvedPath.startsWith(packagesBase + path.sep)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  const stats = fs.statSync(resolvedPath);
  res.setHeader("Content-Length", stats.size);

  const stream = fs.createReadStream(resolvedPath);
  stream.pipe(res);
});

// Small icon placeholder (57x57)
router.get("/install/:id/icon-small.png", (_req: Request, res: Response) => {
  const png = getWhitePng();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", png.length);
  res.send(png);
});

// Large icon placeholder (512x512)
router.get("/install/:id/icon-large.png", (_req: Request, res: Response) => {
  const png = getWhitePng();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", png.length);
  res.send(png);
});

export default router;
