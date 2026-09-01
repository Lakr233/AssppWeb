import express, { Router, Request, Response } from "express";
import { createReadStream } from "fs";
import path from "path";
import {
  REQUIRED_ASSETS,
  assetDirectory,
  fetchAssets,
  verifyAsset,
  verifyAssets,
  type FetchProgress,
} from "../services/sapAssets.js";

const userAgent =
  "Configurator/2.17 (Macintosh; OS X 15.2; 24C5089c) AppleWebKit/0620.1.16.11.6";

// Serves the four Apple binaries the browser-side SAP signer runs under
// emulation. They are public components of a 2013 OS X release, carry no
// credentials, and are identical for every user, so they are plain static
// files rather than anything per-account.
//
// They are not in the image: they are large, they belong to Apple, and the
// signer only needs them when someone signs in. Populate DATA_DIR/sap with
// tools/fetch-sap-assets.mjs.

const router = Router();

// One download at a time, with its state readable while it runs, so a second
// caller watches rather than starting a duplicate.
let fetching: Promise<string[]> | null = null;
let progress: FetchProgress | null = null;
let lastError: string | null = null;

router.post("/sap/assets/fetch", (_req: Request, res: Response) => {
  if (!fetching) {
    lastError = null;
    progress = { stage: "locating", found: [] };

    console.log("SAP assets: fetching from Apple");
    fetching = fetchAssets((update) => {
      progress = update;
      console.log(
        `SAP assets: ${update.stage}` +
          (update.found.length ? ` (${update.found.join(", ")})` : ""),
      );
    })
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        console.error("SAP assets: fetch failed:", lastError);
        throw error;
      })
      .finally(() => {
        fetching = null;
      });

    // Answered immediately; the caller polls GET for how it is going.
    fetching.catch(() => {});
  }

  res.status(202).json({ started: true, progress });
});

router.get("/sap/assets", async (_req: Request, res: Response) => {
  // Digests, not sizes: a file of the right length but wrong contents loads
  // and then fails deep inside the emulator with nothing pointing back here.
  // Verdicts are cached until a file changes, so this is cheap to poll.
  const { ok, missing, corrupt } = await verifyAssets();

  res.json({
    available: ok,
    missing: [...missing, ...corrupt],
    corrupt,
    ready: missing.length === 0 && corrupt.length === 0,
    fetching: fetching !== null,
    progress,
    error: lastError,
  });
});

router.get("/sap/assets/:name", async (req: Request, res: Response) => {
  // Express 5 types a route parameter as string | string[]; the lookup below
  // is what makes it safe either way.
  const name = String(req.params.name ?? "");
  const spec = REQUIRED_ASSETS.find((asset) => asset.name === name);

  // Only the four known names, so the parameter can never walk the filesystem.
  if (!spec) {
    res.status(404).json({ error: "Unknown SAP asset" });
    return;
  }

  const state = await verifyAsset(spec);

  if (state === "missing") {
    res.status(503).json({
      error: `SAP asset ${name} is not installed`,
      hint: "POST /api/sap/assets/fetch to download it from Apple",
    });
    return;
  }

  if (state === "corrupt") {
    res.status(500).json({
      error: `SAP asset ${name} does not match its digest`,
      hint: "POST /api/sap/assets/fetch to replace it",
    });
    return;
  }

  const file = path.join(assetDirectory(), name);
  console.log(`SAP assets: serving ${name} (${spec.size} bytes)`);
  res.type("application/octet-stream");
  res.setHeader("Content-Length", String(spec.size));
  // Immutable: these are fixed files from a 2013 release.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  createReadStream(file).pipe(res);
});

// The two SAP setup endpoints, proxied.
//
// Setting up a signer takes one fetch of Apple's certificate and one exchange
// of an opaque buffer. Neither carries credentials — the only identity in the
// handshake is the device's hardware id, which is the guid the client already
// sends in the clear — so this is the same kind of proxy as /api/bag and does
// not weaken the guarantee that the server never sees Apple credentials.
//
// Proxied rather than tunnelled because the signer runs in a Web Worker,
// where standing up a second Wisp client would buy nothing: there is no
// secret here to keep from the server.

const SETUP_HOSTS: Record<string, string> = {
  certificate: "https://s.mzstatic.com/sap/setupCert.plist",
  setup: "https://fpinit.itunes.apple.com/v1/signSapSetup/legacy",
};

const SAP_TIMEOUT_MS = 30_000;
const SAP_MAX_BYTES = 1 << 20;

async function relay(
  target: string,
  init: RequestInit,
  res: Response,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAP_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, { ...init, signal: controller.signal });
    const body = Buffer.from(await upstream.arrayBuffer());

    if (body.length > SAP_MAX_BYTES) {
      res.status(502).json({ error: "SAP response is too large" });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({ error: `Apple returned ${upstream.status}` });
      return;
    }

    res.type("application/x-plist").send(body);
  } catch (error) {
    console.error("SAP proxy error:", error instanceof Error ? error.message : error);
    res.status(502).json({ error: "SAP request failed" });
  } finally {
    clearTimeout(timer);
  }
}

router.get("/sap/certificate", async (_req: Request, res: Response) => {
  console.log("SAP setup: fetching Apple's certificate");
  await relay(SETUP_HOSTS.certificate, {
    headers: { "User-Agent": userAgent, Accept: "application/x-plist" },
  }, res);
});

router.post(
  "/sap/setup",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Missing SAP setup buffer" });
      return;
    }

    console.log(`SAP setup: exchanging ${req.body.length} bytes with Apple`);
    await relay(SETUP_HOSTS.setup, {
      method: "POST",
      headers: { "User-Agent": userAgent, "Content-Type": "application/x-plist" },
      body: new Uint8Array(req.body),
    }, res);
  },
);

export default router;
