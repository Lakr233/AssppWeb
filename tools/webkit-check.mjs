// Runs the SAP signer in Playwright's WebKit — the engine Safari uses — to
// find out whether it works there at all, and under an iPhone's viewport and
// user agent.
//
// This does not answer the memory question: a desktop WebKit has far more
// headroom than a phone. It answers the other half — whether WebAssembly,
// dedicated workers, the Cache API and the rest behave the way the signer
// needs them to on WebKit rather than on Chrome.
//
// Playwright is not a dependency of this project. ESM resolves imports from
// this file's own directory rather than the working directory, so it has to
// be installed at the repo root — installing it under frontend/ does not help
// however the script is invoked. With the dev servers already up:
//
//   npm install --no-save playwright && npx playwright install webkit
//   node tools/webkit-check.mjs

import { webkit, devices } from "playwright";

const TARGET = process.env.TARGET ?? "http://localhost:5173/";
const BUDGET_MS = 6 * 60 * 1000;

const browser = await webkit.launch();
const context = await browser.newContext(devices["iPhone 15"]);
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error.message)));

console.log(`WebKit ${browser.version()}, iPhone 15 profile`);
console.log(`opening ${TARGET}`);
await page.goto(TARGET, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async () => {
  const marks = [];
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);

  const capability = {
    webassembly: typeof WebAssembly === "object",
    worker: typeof Worker === "function",
    caches: typeof caches === "object",
    bigint: typeof BigInt === "function",
  };

  try {
    const mod = await import("/src/apple/sap/client.ts");
    let last = "";

    await mod.prepareSigner("020000000000", (progress) => {
      if (progress.phase !== last) {
        last = progress.phase;
        marks.push(`${progress.phase}@${at()}ms`);
      }
    });

    const setupMs = at();
    const s0 = performance.now();
    const signature = await mod.signAction(new TextEncoder().encode("<plist/>"));

    return {
      ok: true,
      capability,
      marks,
      setupMs,
      signMs: Math.round(performance.now() - s0),
      signatureBytes: signature.length,
    };
  } catch (error) {
    return {
      ok: false,
      capability,
      marks,
      error: String((error && error.message) || error),
    };
  }
}, { timeout: BUDGET_MS });

console.log();
console.log(JSON.stringify(result, null, 2));
if (consoleErrors.length) {
  console.log("\nconsole errors:");
  for (const line of consoleErrors.slice(0, 8)) console.log(`  ${line}`);
}

await browser.close();
process.exitCode = result.ok ? 0 : 1;
