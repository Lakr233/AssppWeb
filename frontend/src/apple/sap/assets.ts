// Fetches the Apple binaries the SAP signer runs under emulation.
//
// They total about 38 MB and never change — they come from a 2013 OS X
// release — so they are cached and reused. The backend serves them from its
// data directory, and fetches them from Apple the first time they are asked
// for, so a fresh deployment needs nothing done to it by hand.

import type { AssetBundle } from "./machine";

const CACHE_NAME = "sap-assets-v2";

const FILES = {
  commerceKit: "CommerceKit",
  commerceCore: "CommerceCore",
  coreFP: "CoreFP",
  coreFPICXS: "CoreFP.icxs",
} as const;

export interface AssetProgress {
  name: string;
  loaded: number;
  total: number;
}

interface AssetStatus {
  ready: boolean;
  fetching: boolean;
  missing: string[];
  progress: { stage: string; found: string[] } | null;
  error: string | null;
}

const FETCH_POLL_MS = 3000;
const FETCH_TIMEOUT_MS = 10 * 60 * 1000;

async function status(headers: Record<string, string>): Promise<AssetStatus> {
  const response = await fetch("/api/sap/assets", { headers });
  if (!response.ok) throw new Error("cannot reach the SAP asset service");
  return response.json();
}

/**
 * Makes sure the backend has the assets, asking it to fetch them from Apple
 * if not. They land in its data directory and stay there, so this is a
 * one-off on a fresh deployment rather than something every visitor pays.
 */
async function ensureInstalled(
  headers: Record<string, string>,
  onProgress?: (progress: AssetProgress) => void,
): Promise<void> {
  let state = await status(headers);
  if (state.ready) return;

  if (!state.fetching) {
    const response = await fetch("/api/sap/assets/fetch", {
      method: "POST",
      headers,
    });
    if (!response.ok) {
      throw new Error("the server could not start fetching the SAP assets");
    }
  }

  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for the server to fetch the SAP assets");
    }

    await new Promise((resolve) => setTimeout(resolve, FETCH_POLL_MS));
    state = await status(headers);

    if (state.ready) return;
    if (state.error) throw new Error(state.error);

    // Report as an asset-shaped step so the caller has one progress channel.
    const found = state.progress?.found.length ?? 0;
    onProgress?.({
      name: state.progress?.stage ?? "server",
      loaded: found,
      total: 4,
    });
  }
}

/** Reports whether the backend has the assets, without downloading them. */
export async function assetsReady(
  headers: Record<string, string> = {},
): Promise<boolean> {
  try {
    const response = await fetch("/api/sap/assets", { headers });
    if (!response.ok) return false;
    return Boolean((await response.json()).ready);
  } catch {
    return false;
  }
}

async function fetchAsset(
  name: string,
  headers: Record<string, string>,
  onProgress?: (progress: AssetProgress) => void,
): Promise<Uint8Array> {
  const url = `/api/sap/assets/${name}`;

  // The Cache API is unavailable on insecure origins, so treat it as an
  // optimisation rather than a requirement.
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      onProgress?.({ name, loaded: bytes.length, total: bytes.length });
      return bytes;
    }
  } catch {
    cache = null;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error ?? `failed to fetch SAP asset ${name}`);
  }

  try {
    await cache?.put(url, response.clone());
  } catch {
    // A full or unavailable cache only costs a re-download next time.
  }

  const total = Number(response.headers.get("Content-Length") ?? 0);
  if (!response.body || !onProgress) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ name, loaded, total });
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}

export async function loadAssets(
  headers: Record<string, string> = {},
  onProgress?: (progress: AssetProgress) => void,
): Promise<AssetBundle> {
  await ensureInstalled(headers, onProgress);

  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, name]) => {
      return [key, await fetchAsset(name, headers, onProgress)] as const;
    }),
  );

  return Object.fromEntries(entries) as unknown as AssetBundle;
}
