import { Router, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config.js";

const router = Router();

router.get("/auth/status", (_req: Request, res: Response) => {
  res.json({ required: config.accessPassword.length > 0 });
});

router.post("/auth/verify", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!config.accessPassword) {
    res.json({ ok: true });
    return;
  }

  if (!password || typeof password !== "string") {
    res.json({ ok: false });
    return;
  }

  const expected = Buffer.from(config.accessPassword, "utf8");
  const actual = Buffer.from(password, "utf8");

  const ok =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  res.json({ ok });
});

export default router;
