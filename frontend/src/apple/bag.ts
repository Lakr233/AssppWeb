import { authHeaders } from "../api/client";
import { parsePlist } from "./plist";

export interface BagOutput {
  authURL: string;
  redownloadURL?: string;
  updateURL?: string;
}

export const defaultAuthURL =
  "https://auth.itunes.apple.com/auth/v1/native/fast/";

const NATIVE_AUTH_HOST = "auth.itunes.apple.com";

// The bag advertises the native auth endpoint without the /fast/ sub-path that
// the login flow requires; the no-trailing-slash variant 301s to an HTML page.
// Legacy Store authentication also requires a trailing slash; the bare path
// can return an empty response or an HTML error even when correctly signed.
export function normalizeAuthURL(rawURL: string): string {
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    return rawURL;
  }
  if (
    /^(?:buy|p\d+-buy)\.itunes\.apple\.com$/.test(url.hostname) &&
    /^\/WebObjects\/MZFinance\.woa\/wa\/authenticate\/*$/.test(url.pathname)
  ) {
    url.pathname = '/WebObjects/MZFinance.woa/wa/authenticate/';
    return url.toString();
  }
  if (url.hostname !== NATIVE_AUTH_HOST) {
    return rawURL;
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/fast")) {
    path += "/fast";
  }
  url.pathname = `${path}/`;
  return url.toString();
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

    // authenticateAccount used to live inside the urlBag dict; newer bag
    // responses move it to the plist root, so prefer the root and fall back.
    const urlBag = dict.urlBag as Record<string, any> | undefined;
    const authURL =
      (dict.authenticateAccount as string | undefined) ??
      (urlBag?.authenticateAccount as string | undefined);

    const downloadURLs = {
      redownloadURL: (dict.redownloadProduct ?? urlBag?.redownloadProduct) as string | undefined,
      updateURL: (dict.updateProduct ?? urlBag?.updateProduct) as string | undefined,
    };

    if (!authURL) {
      console.warn(
        "[Bag] authenticateAccount URL not found in bag, using default auth endpoint",
      );
      return { authURL: defaultAuthURL, ...downloadURLs };
    }

    return { authURL: normalizeAuthURL(authURL), ...downloadURLs };
  } catch (error) {
    console.warn(
      `[Bag] Failed to fetch/parse bag, using default auth endpoint: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { authURL: defaultAuthURL };
  }
}
