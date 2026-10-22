// Type shim for the emscripten module built by scripts/unicorn-wasm/build.sh.
declare const UnicornModuleFactory: (
  config?: Record<string, unknown>,
) => Promise<unknown>;
export default UnicornModuleFactory;
