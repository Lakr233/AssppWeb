// SAP asset routes: status/prepare for the extraction job and authenticated
// downloads of the four cached Apple binaries. The files are public Apple
// content (extracted from a public software update package, digest-pinned),
// placing them in the same trust class as the bag proxy.

import { Router, Request, Response } from "express";
import zlib from "node:zlib";
import {
  SAP_ASSET_SPECS,
  ensureSapAssets,
  readCachedAsset,
  sapAssetsState,
} from "../services/sapAssets.js";

const router = Router();

router.get("/sap-assets/status", (_req: Request, res: Response) => {
  res.json(sapAssetsState());
});

router.post("/sap-assets/prepare", async (_req: Request, res: Response) => {
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

router.get("/sap-assets/:name", async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    res.status(404).json({ error: "Unknown SAP asset" });
    return;
  }

  let data = await readCachedAsset(name);
  if (!data) {
    try {
      await ensureSapAssets();
      data = await readCachedAsset(name);
    } catch (error) {
      res.status(503).json({
        error:
          error instanceof Error ? error.message : "SAP asset extraction failed",
      });
      return;
    }
  }
  if (!data) {
    res.status(503).json({ error: "SAP asset unavailable" });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("ETag", `"${spec.strippedSha256}"`);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  // gzip cuts the ~22.5 MiB bundle to ~14 MiB on the wire (CoreFP's obfuscated
  // __TEXT compresses at ~50%, the icxs data blob at ~13% of its size).
  if (req.headers["accept-encoding"]?.includes("gzip") && data.length > 65536) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.send(zlib.gzipSync(data, { level: 9 }));
    return;
  }
  res.send(data);
});

export default router;
