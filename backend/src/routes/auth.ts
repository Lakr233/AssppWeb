import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config.js";

const router = Router();

// Check if password protection is enabled
router.get("/auth/status", (_req, res) => {
  res.json({ required: config.accessPassword.length > 0 });
});

// Verify access password
router.post("/auth/verify", (req, res) => {
  const { password } = req.body as { password?: string };

  if (!config.accessPassword) {
    return res.json({ ok: true });
  }

  if (!password || typeof password !== "string") {
    return res.json({ ok: false });
  }

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(config.accessPassword, "utf8");
  const actual = Buffer.from(password, "utf8");

  const ok =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  return res.json({ ok });
});

export default router;
