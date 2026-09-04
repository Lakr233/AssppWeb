// SAP asset delivery: the four Apple binaries (CoreFP, CoreFP.icxs,
// CommerceKit, CommerceCore) are extracted once by the backend from a public
// Apple software update package and served from /api/sap-assets. The browser
// caches them in the Cache API keyed by their pinned SHA-256 digests.

import { authHeaders } from "../../api/client";
import type { SapAssetBundle } from "./types";

export interface SapAssetSpec {
  name: string;
  /** Size/digest of the distributed (backend-stripped) x86_64 file. */
  size: number;
  sha256: string;
}

/**
 * Digests of the distributed assets. The backend strips fat binaries to their
 * x86_64 slice (the emulated guest architecture) after verifying Apple's
 * original digests during extraction — see
 * backend/src/services/sapAssets.ts for both pin sets.
 */
export const SAP_ASSET_SPECS: SapAssetSpec[] = [
  {
    name: "CommerceKit",
    size: 3271840,
    sha256: "b84ff12c21987856c0a17b78f1ad82b73195a6dec5f3b208a17d245555a2c8a2",
  },
  {
    name: "CommerceCore",
    size: 115712,
    sha256: "05707cd937798f2b5189471f513672ac6242ffbffc38f06ed2e4fb4345156819",
  },
  {
    name: "CoreFP",
    size: 14904192,
    sha256: "97c899f2fb076bdf7f810fe00ceb335d4af85efab0f2de737ad0aedd991c8277",
  },
  {
    name: "CoreFP.icxs",
    size: 5288352,
    sha256: "473e78af86979f5bd4f6269561caf770b3d16c098d918846eeac8cdd2fe6566a",
  },
];

const CACHE_NAME = "asspp-sap-assets-v1";

async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`SAP asset download failed: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const assembled = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    assembled.set(chunk, offset);
    offset += chunk.length;
  }
  return assembled;
}

async function digestMatches(data: Uint8Array, expected: string): Promise<boolean> {
  const view = new Uint8Array(data.length);
  view.set(data);
  const digest = await crypto.subtle.digest("SHA-256", view.buffer as ArrayBuffer);
  const actual = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return actual === expected;
}

/**
 * Loads all four SAP assets, verifying digests. Served bytes come from the
 * backend cache (public Apple data); the browser persists them in the Cache
 * API so the ~38 MiB transfer happens once.
 */
export async function loadSapAssets(
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
): Promise<SapAssetBundle> {
  const totalBytes = SAP_ASSET_SPECS.reduce((sum, spec) => sum + spec.size, 0);
  let loadedBytes = 0;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    // Cache API unavailable (private mode); fall back to direct downloads.
  }

  const bundle: Record<string, Uint8Array> = {};
  for (const spec of SAP_ASSET_SPECS) {
    let data: Uint8Array | null = null;

    if (cache) {
      const cached = await cache.match(`/api/sap-assets/${spec.name}`);
      if (cached) {
        const buffer = await cached.arrayBuffer();
        const cachedBytes = new Uint8Array(buffer);
        if (await digestMatches(cachedBytes, spec.sha256)) {
          data = new Uint8Array(cachedBytes);
        }
      }
    }

    if (!data) {
      data = await fetchWithProgress(`/api/sap-assets/${spec.name}`, (loaded) =>
        onProgress?.(loadedBytes + loaded, totalBytes),
      );
      if (!(await digestMatches(data, spec.sha256))) {
        throw new Error(`SAP asset ${spec.name} failed integrity verification`);
      }
      if (cache) {
        const copy = new Uint8Array(data);
        await cache.put(
          `/api/sap-assets/${spec.name}`,
          new Response(copy.buffer as ArrayBuffer, {
            headers: { "Content-Type": "application/octet-stream" },
          }),
        );
      }
    }

    loadedBytes += spec.size;
    onProgress?.(loadedBytes, totalBytes);
    bundle[spec.name] = data;
  }

  return {
    commerceKit: bundle["CommerceKit"],
    commerceCore: bundle["CommerceCore"],
    coreFP: bundle["CoreFP"],
    coreFPICXS: bundle["CoreFP.icxs"],
  };
}

/** Drops the cached assets (used after a digest pin update). */
export async function clearSapAssets(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
}
