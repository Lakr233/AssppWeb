// Build-time SAP asset extraction entrypoint (used by the Dockerfile).
// Downloads the public Apple update package once, verifies the pinned
// digests, strips fat binaries to their x86_64 slices, and writes the four
// files into OUT_DIR so the runtime image can ship them prebaked.

import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];

if (!outDir) {
  console.error("usage: DATA_DIR=<workdir> tsx scripts/extract-sap-assets.mts <out-dir>");
  process.exit(1);
}

if (!process.env.DATA_DIR) {
  console.error("DATA_DIR must be set (config.ts reads it at import time)");
  process.exit(1);
}

// Imported after the DATA_DIR guard: the config module captures the env at
// import time, so a default assigned here would arrive too late.
const { ensureSapAssets, readCachedAsset, SAP_ASSET_SPECS } = await import(
  "../src/services/sapAssets.ts"
);

await ensureSapAssets();
await mkdir(outDir, { recursive: true });

for (const spec of SAP_ASSET_SPECS) {
  const data = await readCachedAsset(spec.name);
  if (!data) {
    throw new Error(`asset ${spec.name} missing after extraction`);
  }
  await copyFile(
    path.join(process.env.DATA_DIR, "sap-assets", spec.name),
    path.join(outDir, spec.name),
  );
  console.log(`${spec.name}: ${data.length} bytes`);
}

console.log(`SAP assets prebaked into ${outDir}`);
