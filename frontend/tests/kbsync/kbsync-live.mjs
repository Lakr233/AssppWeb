// Generates kbsync with the real Apple assets (no network).
// Run with: KBSYNC_ASSET_DIR=<dir with the five assets> npx tsx tests/kbsync/kbsync-live.mjs
import { readFileSync } from 'node:fs';
import { generateKBSync } from '../../src/apple/kbsync/storeAgent.ts';

const dir = process.env.KBSYNC_ASSET_DIR;
if (!dir) throw new Error('KBSYNC_ASSET_DIR is required');
const read = (name) => new Uint8Array(readFileSync(`${dir}/${name}`));
const assets = {
  commerceKit: read('CommerceKit'),
  commerceCore: read('CommerceCore'),
  coreFP: read('CoreFP'),
  coreFPICXS: read('CoreFP.icxs'),
  storeAgent: read('storeagent'),
};
const wasmBinary = readFileSync(new URL('../../src/apple/kbsync/vendor/unicorn.wasm', import.meta.url));

const hardwareID = Uint8Array.from([0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f]);
const started = Date.now();
const kbsync = await generateKBSync(assets, hardwareID, 12345678901, { wasmBinary });
console.log(`kbsync: ${kbsync.length} bytes in ${Date.now() - started}ms`);
console.log(
  Buffer.from(kbsync)
    .toString(process.env.KBSYNC_FULL ? 'hex' : 'base64')
    .slice(0, process.env.KBSYNC_FULL ? undefined : 48),
);
