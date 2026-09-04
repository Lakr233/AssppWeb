// Full-chain SAP machine test with the real Apple assets (no network):
// open images -> Initialize -> Sign. Run with: npx tsx tests/sap/machine-live.mjs
import { readFileSync } from "node:fs";
import { SapMachine } from "../../src/apple/sap/machine.ts";

// Asset layout: either SAP_ASSET_DIR pointing at a flat directory holding
// the four files, or the nested structure produced by the shell extraction.
import { existsSync } from "node:fs";
const FLAT = process.env.SAP_ASSET_DIR ?? "/tmp/sap-backend-test/sap-assets";
const NESTED = "/tmp/sap-extract/extracted/System/Library/PrivateFrameworks";
const DIR = existsSync(`${FLAT}/CoreFP`)
  ? null // flat layout handled below
  : NESTED;
const CK = DIR ? `${DIR}/CommerceKit.framework/Versions/A/CommerceKit` : `${FLAT}/CommerceKit`;
const CC = DIR
  ? `${DIR}/CommerceKit.framework/Versions/A/Frameworks/CommerceCore.framework/Versions/A/CommerceCore`
  : `${FLAT}/CommerceCore`;
const CFP = DIR ? `${DIR}/CoreFP.framework/Versions/A/CoreFP` : `${FLAT}/CoreFP`;
const ICXS = DIR ? `${DIR}/CoreFP.framework/Versions/A/CoreFP.icxs` : `${FLAT}/CoreFP.icxs`;
const assets = {
  coreFP: new Uint8Array(readFileSync(CFP)),
  coreFPICXS: new Uint8Array(readFileSync(ICXS)),
  commerceKit: new Uint8Array(readFileSync(CK)),
  commerceCore: new Uint8Array(readFileSync(CC)),
};
console.log(
  "assets loaded:",
  Object.entries(assets).map(([k, v]) => `${k}=${v.length}`).join(" "),
);

const wasmBinary = readFileSync(new URL("../../src/apple/sap/vendor/unicorn.wasm", import.meta.url));

const t0 = Date.now();
const machine = await SapMachine.open(assets, { wasmBinary });
console.log(`machine open OK (${Date.now() - t0}ms)`);

const hardwareID = new TextEncoder().encode("0123456789ab");
const t1 = Date.now();
const context = machine.initialize(hardwareID);
console.log(`initialize OK (${Date.now() - t1}ms): context = 0x${context.toString(16)}`);

const t2 = Date.now();
const body = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>appleId</key><string>test@example.com</string></dict></plist>',
);
// Signing requires the Apple key exchange (GET certificate + POST setup).
// Without it the guest reports -42085 on both the native ipatool runtime and
// this port; that exact match is the assertion.
let signStatus = "none";
try {
  machine.sign(context, body);
} catch (e) {
  signStatus = e.message.match(/-?\d+/)?.[0] ?? e.message;
}
if (signStatus !== "-42085") {
  throw new Error(`expected sign status -42085, got: ${signStatus}`);
}
console.log(`sign gated on key exchange (${Date.now() - t2}ms): -42085 as native`);

machine.teardown(context);
machine.close();
console.log("FULL CHAIN OK");
