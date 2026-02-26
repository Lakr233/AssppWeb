import { Request, Response, NextFunction } from "express";
import { accessPasswordHash, verifyAccessToken } from "../config.js";

export function accessAuth(req: Request, res: Response, next: NextFunction) {
  if (!accessPasswordHash) {
    next();
    return;
  }

  if (req.path.startsWith("/auth/") || req.path.startsWith("/install/")) {
    next();
    return;
  }

  const token = req.headers["x-access-token"];
  if (typeof token === "string" && verifyAccessToken(token)) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}
