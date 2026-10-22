// SAP asset routes: status/prepare for the extraction job and authenticated
// downloads of the five cached Apple binaries. The files are public Apple
// content (extracted from a public software update package, digest-pinned),
// placing them in the same trust class as the bag proxy.

import { Router, Request, Response } from 'express';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { SAP_ASSET_SPECS, ensureSapAssets, readCachedAsset, sapAssetsState } from '../services/sapAssets.js';

const router = Router();
const gzip = promisify(zlib.gzip);

interface ServedAsset {
  raw: Buffer;
  gzipped: Buffer;
}

// Assets are immutable and digest-pinned, so verify and compress each one once.
// Re-reading, re-hashing and gzip -9 per request would let repeated downloads
// monopolize the event loop that also carries every Wisp tunnel.
const served = new Map<string, Promise<ServedAsset | null>>();

function loadServedAsset(name: string): Promise<ServedAsset | null> {
  let pending = served.get(name);
  if (!pending) {
    pending = readCachedAsset(name).then(async (raw) => (raw ? { raw, gzipped: await gzip(raw, { level: 9 }) } : null));
    served.set(name, pending);
    // Missing or failed reads must not stick; extraction may complete later.
    pending.then(
      (asset) => {
        if (!asset) served.delete(name);
      },
      () => served.delete(name),
    );
  }
  return pending;
}

router.get('/sap-assets/status', (_req: Request, res: Response) => {
  res.json(sapAssetsState());
});

router.post('/sap-assets/prepare', async (_req: Request, res: Response) => {
  try {
    // Fire-and-observe: the caller polls /status for progress.
    const preparation = ensureSapAssets();
    void preparation.catch(() => undefined);
    res.json(sapAssetsState());
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/sap-assets/:name', async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    res.status(404).json({ error: 'Unknown SAP asset' });
    return;
  }

  let asset = await loadServedAsset(name);
  if (!asset) {
    try {
      await ensureSapAssets();
      asset = await loadServedAsset(name);
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'SAP asset extraction failed',
      });
      return;
    }
  }
  if (!asset) {
    res.status(503).json({ error: 'SAP asset unavailable' });
    return;
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('ETag', `"${spec.strippedSha256}"`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  // gzip cuts the ~22.5 MiB bundle to ~14 MiB on the wire (CoreFP's obfuscated
  // __TEXT compresses at ~50%, the icxs data blob at ~13% of its size).
  if (req.headers['accept-encoding']?.includes('gzip') && asset.raw.length > 65536) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(asset.gzipped);
    return;
  }
  res.send(asset.raw);
});

export default router;
