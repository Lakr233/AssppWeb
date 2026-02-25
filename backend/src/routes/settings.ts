import { Router, Request, Response } from "express";
import { config } from "../config.js";

const router = Router();
const startedAt = Date.now();

router.get("/settings", (_req: Request, res: Response) => {
  res.json({
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    buildCommit: config.buildCommit,
    buildDate: config.buildDate,
    port: config.port,
    dataDir: config.dataDir,
    publicBaseUrl: config.publicBaseUrl,
    disableHttpsRedirect: config.disableHttpsRedirect,
    autoCleanupDays: config.autoCleanupDays,
    autoCleanupMaxMB: config.autoCleanupMaxMB,
  });
});

export default router;
