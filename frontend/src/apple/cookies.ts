import type { Cookie } from "../types";

export function extractAndMergeCookies(
  rawHeaders: Iterable<[string, string]>,
  existingCookies: Cookie[],
): Cookie[] {
  const setCookies: string[] = [];
  for (const [key, value] of rawHeaders) {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(value);
    }
  }
  if (setCookies.length > 0) {
    return mergeCookies(existingCookies, parseCookieHeaders(setCookies));
  }
  return existingCookies;
}

export function mergeCookies(
  existing: Cookie[],
  newCookies: Cookie[],
): Cookie[] {
  const dict = new Map<string, Cookie>();
  for (const cookie of existing) {
    dict.set(cookie.name, cookie);
  }
  for (const cookie of newCookies) {
    dict.set(cookie.name, cookie);
  }
  return Array.from(dict.values());
}

export function buildCookieHeader(cookies: Cookie[], url: string): string {
  let host: string;
  let path: string;
  let scheme: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    path = parsed.pathname || "/";
    scheme = parsed.protocol;
  } catch {
    return "";
  }

  const valid: string[] = [];
  const now = Date.now() / 1000;

  for (const cookie of cookies) {
    if (!cookie.name || !cookie.value) continue;

    if (cookie.domain) {
      if (!matchesDomain(cookie.domain, host)) continue;
    }

    if (!matchesPath(cookie.path, path)) continue;

    if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) continue;

    if (cookie.secure && scheme !== "https:") continue;

    valid.push(`${cookie.name}=${cookie.value}`);
  }

  return valid.join("; ");
}

export function parseCookieHeaders(setCookieHeaders: string[]): Cookie[] {
  const cookies: Cookie[] = [];

  for (const header of setCookieHeaders) {
    const parts = header.split(";").map((s) => s.trim());
    if (parts.length === 0) continue;

    const nameValue = parts[0];
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx < 0) continue;

    const name = nameValue.substring(0, eqIdx).trim();
    const value = nameValue.substring(eqIdx + 1).trim();
    if (!name) continue;

    let path = "/";
    let domain: string | undefined;
    let expiresAt: number | undefined;
    let httpOnly = false;
    let secure = false;

    for (let i = 1; i < parts.length; i++) {
      const attr = parts[i];
      const attrEq = attr.indexOf("=");
      const attrName = (attrEq >= 0 ? attr.substring(0, attrEq) : attr)
        .trim()
        .toLowerCase();
      const attrVal = attrEq >= 0 ? attr.substring(attrEq + 1).trim() : "";

      switch (attrName) {
        case "path":
          path = attrVal || "/";
          break;
        case "domain":
          domain = attrVal.startsWith(".") ? attrVal.substring(1) : attrVal;
          break;
        case "max-age": {
          const maxAge = parseInt(attrVal, 10);
          if (!isNaN(maxAge)) {
            expiresAt = Date.now() / 1000 + maxAge;
          }
          break;
        }
        case "expires": {
          const d = new Date(attrVal);
          if (!isNaN(d.getTime())) {
            expiresAt = d.getTime() / 1000;
          }
          break;
        }
        case "httponly":
          httpOnly = true;
          break;
        case "secure":
          secure = true;
          break;
      }
    }

    cookies.push({ name, value, path, domain, expiresAt, httpOnly, secure });
  }

  return cookies;
}

function matchesDomain(cookieDomain: string, requestHost: string): boolean {
  const normalized = cookieDomain.toLowerCase();
  const host = requestHost.toLowerCase();
  return host === normalized || host.endsWith("." + normalized);
}

function matchesPath(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === "/") return true;
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}
