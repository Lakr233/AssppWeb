#!/usr/bin/env node
// Populates DATA_DIR/sap with the four Apple binaries the browser-side SAP
// signer runs under emulation.
//
// The backend fetches these from Apple on its own the first time the signer
// asks for them, so this script is only a shortcut: if ipatool has already
// cached them on this machine, copying is faster than downloading 38 MB out
// of a 2013 update package again.
//
// The files carry no credentials and are identical for everyone; they are
// kept out of the image because they are large and belong to Apple.
//
//   node tools/fetch-sap-assets.mjs [--data-dir ./mnt/asspp-data]

import { copyFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const ASSETS = [
  {
    name: "CommerceKit",
    size: 3271840,
    sha256: "b84ff12c21987856c0a17b78f1ad82b73195a6dec5f3b208a17d245555a2c8a2",
  },
  {
    name: "CommerceCore",
    size: 207744,
    sha256: "c5401e57402230f3c876409d295319ddf1e61287bc882683c5d61277be7bc1f2",
  },
  {
    name: "CoreFP",
    size: 29014912,
    sha256: "f19141336be4198d0f8991bb00017c915efc7aeaece36c345f7faa1237ea6074",
  },
  {
    name: "CoreFP.icxs",
    size: 5288352,
    sha256: "473e78af86979f5bd4f6269561caf770b3d16c098d918846eeac8cdd2fe6566a",
  },
];

/** Where ipatool caches them, per os.UserCacheDir on each platform. */
function ipatoolCache() {
  const relative = join("ipatool", "sap", "apple-assets-v2");

  if (platform() === "darwin") {
    return join(homedir(), "Library", "Caches", relative);
  }
  if (platform() === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), relative);
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), relative);
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function main() {
  const flag = process.argv.indexOf("--data-dir");
  const dataDir = flag === -1 ? process.env.DATA_DIR ?? "./mnt/asspp-data" : process.argv[flag + 1];
  const target = join(dataDir, "sap");
  const source = ipatoolCache();

  await mkdir(target, { recursive: true });

  let copied = 0;
  let present = 0;
  const missing = [];

  for (const asset of ASSETS) {
    const destination = join(target, asset.name);

    try {
      if ((await stat(destination)).size === asset.size) {
        present++;
        continue;
      }
    } catch {
      // not there yet
    }

    const origin = join(source, asset.name);
    try {
      if ((await stat(origin)).size !== asset.size) throw new Error("wrong size");
    } catch {
      missing.push(asset.name);
      continue;
    }

    const actual = await digest(origin);
    if (actual !== asset.sha256) {
      console.error(`${asset.name}: digest mismatch, refusing to copy`);
      console.error(`  expected ${asset.sha256}`);
      console.error(`  found    ${actual}`);
      missing.push(asset.name);
      continue;
    }

    await copyFile(origin, destination);
    console.log(`copied ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)`);
    copied++;
  }

  if (present) console.log(`${present} already present`);

  if (missing.length === 0) {
    console.log(`\nSAP assets ready in ${target}`);
    return;
  }

  console.error(`\nmissing: ${missing.join(", ")}`);
  console.error(`\nThey were not found in ${source}, which is fine — the`);
  console.error("backend downloads them from Apple the first time the signer");
  console.error("runs. This script only saves that download when ipatool has");
  console.error("already cached them here.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
