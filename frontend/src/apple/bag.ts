import { authHeaders } from "../api/client";
import { parsePlist } from "./plist";

export interface BagOutput {
  authURL: string;
}

// The native "fast" auth endpoint. Apple's newer bag responses point auth at
// auth.itunes.apple.com, and the native auth flow requires the /fast sub-path.
export const defaultAuthURL =
  "https://auth.itunes.apple.com/auth/v1/native/fast";

// Apple's newer auth endpoint base (auth.itunes.apple.com) requires the /fast
// sub-path. Append it when missing so the native auth flow resolves correctly.
function normalizeAuthURL(url: string): string {
  if (url.includes("auth.itunes.apple.com") && !url.endsWith("/fast")) {
    return `${url}/fast`;
  }
  return url;
}

// Fetches the bag via the backend proxy.
// The backend fetches it using Node.js native HTTPS.
// The bag response is public data (Apple service URLs, no credentials).
export async function fetchBag(deviceId: string): Promise<BagOutput> {
  try {
    const resp = await fetch(`/api/bag?guid=${encodeURIComponent(deviceId)}`, {
      headers: authHeaders(),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      console.warn(
        `[Bag] Proxy request failed, using default auth endpoint: ${err.error || `HTTP ${resp.status}`}`,
      );
      return { authURL: defaultAuthURL };
    }

    const xml = await resp.text();
    const dict = parsePlist(xml) as Record<string, any>;

    // authenticateAccount may be at top level or inside a urlBag dict.
    // Prefer the top-level value, falling back to the urlBag entry.
    let authURL = dict.authenticateAccount as string | undefined;
    if (!authURL) {
      const urlBag = dict.urlBag as Record<string, any> | undefined;
      authURL = urlBag?.authenticateAccount as string | undefined;
    }

    if (!authURL) {
      console.warn(
        "[Bag] authenticateAccount URL not found in bag, using default auth endpoint",
      );
      return { authURL: defaultAuthURL };
    }

    return { authURL: normalizeAuthURL(authURL) };
  } catch (error) {
    console.warn(
      `[Bag] Failed to fetch/parse bag, using default auth endpoint: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { authURL: defaultAuthURL };
  }
}
