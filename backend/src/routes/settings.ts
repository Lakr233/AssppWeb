import { Router, Request, Response } from "express";
import { config } from "../config.js";

const router = Router();
const startedAt = Date.now();

router.get("/settings", (_req: Request, res: Response) => {
  res.json({
    version: "1.0.0",
    dataDir: config.dataDir,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});

export default router;
