import { Router, Request, Response } from "express";
import { config, accessPasswordHash, verifyAccessToken } from "../config.js";

const router = Router();

router.get("/auth/status", (_req: Request, res: Response) => {
  res.json({ required: config.accessPassword.length > 0 });
});

router.post("/auth/verify", (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };

  if (!accessPasswordHash) {
    res.json({ ok: true });
    return;
  }

  if (!token || typeof token !== "string") {
    res.json({ ok: false });
    return;
  }

  res.json({ ok: verifyAccessToken(token) });
});

export default router;
