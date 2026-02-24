import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function httpsRedirect(req: Request, res: Response, next: NextFunction) {
  if (config.disableHttpsRedirect) return next();
  if (req.headers["x-forwarded-proto"] === "http") {
    // Only use the Host header (not x-forwarded-host) to prevent open redirects
    const host = (req.headers["host"] || "").replace(/[^\w.\-:]/g, "");
    if (!host) return next();
    return res.redirect(301, `https://${host}${req.url}`);
  }
  next();
}
