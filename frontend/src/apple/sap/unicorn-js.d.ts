// unicorn.js ships no type declarations. The surface used here is narrow and
// fully exercised by engine.ts, so it is declared as a loose module rather
// than modelled in detail.
declare module "@alexaltea/unicorn-js/x86" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory: () => Promise<any>;
  export default factory;
}
