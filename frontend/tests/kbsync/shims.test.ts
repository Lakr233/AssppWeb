// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UnicornEngine, X86_REG } from '../../src/apple/kbsync/engine';
import { Shims } from '../../src/apple/kbsync/shims';

const CODE = 0x1000;
const RESULT = 0x1800;
const PATH = 0x1900;
const STACK = 0x10000;

function u64(value: number): number[] {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return [...bytes];
}

// Calls one guest service and stores the full 64-bit RAX it returns.
async function callService(name: string): Promise<string> {
  const wasmBinary = readFileSync(new URL('../../src/apple/kbsync/vendor/unicorn.wasm', import.meta.url));
  const engine = await UnicornEngine.open({ wasmBinary: new Uint8Array(wasmBinary).buffer });
  try {
    engine.memMap(CODE, 0x1000);
    engine.memMap(STACK, 0x10000);
    const shims = await Shims.open(engine, {}, new Uint8Array());
    const code = [
      ...[0x48, 0xb8, ...u64(shims.resolve(name))], // mov rax, service
      0xff,
      0xd0, // call rax
      ...[0x48, 0xa3, ...u64(RESULT)], // mov [RESULT], rax
      0xf4, // hlt
    ];
    engine.memWrite(CODE, Uint8Array.from(code));
    engine.memWrite(RESULT, Uint8Array.from(u64(0x1234)));
    engine.memWrite(PATH, new TextEncoder().encode('/Users/Shared/SC Info/missing\0'));
    engine.regWrite(X86_REG.RDI, PATH);
    engine.regWrite(X86_REG.RAX, 0x1234);
    engine.regWrite(X86_REG.RSP, STACK + 0x8000);
    engine.emuStart(CODE, CODE + code.length - 1, 1_000_000, 0);
    expect(shims.fault).toBeNull();
    return Buffer.from(engine.memRead(RESULT, 8)).toString('hex');
  } finally {
    engine.close();
  }
}

describe('guest service results', () => {
  it('returns a full 64-bit -1 from a failed open()', async () => {
    expect(await callService('_open')).toBe('ffffffffffffffff');
  });

  it('returns 0 without the all-ones adjustment', async () => {
    expect(await callService('_close')).toBe('0000000000000000');
  });
});
