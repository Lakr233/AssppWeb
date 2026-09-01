// Guest service area for the SAP runtime.
//
// Ported from ipatool's internal/sap/machine/shims.go and shim_memory.go. The
// guest images import around 500 symbols; only the ones the signing path
// actually touches are implemented, and the rest get a stub that faults only
// if the guest calls it.
//
// Each service is a 16-byte slot holding a single RET. A UC_HOOK_CODE over the
// code area catches the entry, the handler runs on the host, and the RET
// returns to the caller — so the guest never notices the call left the VM.

import type { Engine } from "./engine";

export const SHIM_BASE = 0x0000200000000000n;
export const SHIM_CODE_SIZE = 0x0000000000080000n;
export const SHIM_SIZE = 0x0000000000100000n;
const SHIM_SLOT_SIZE = 16n;

export const HEAP_BASE = 0x0000400000000000n;
export const HEAP_SIZE = 64n << 20n;

const MAX_GUEST_TRANSFER = 64n << 20n;
const U64_MASK = (1n << 64n) - 1n;

type ShimHandler = () => void;

interface Allocation {
  size: bigint;
  reserved: bigint;
}

interface FreeBlock {
  address: bigint;
  size: bigint;
}

export function align(value: bigint, alignment: bigint): bigint {
  return (value + alignment - 1n) & ~(alignment - 1n);
}

function maxBig(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

export class Shims {
  private readonly engine: Engine;
  private readonly entries = new Map<bigint, { name: string; handler: ShimHandler }>();
  readonly symbols = new Map<string, bigint>();

  private codeCursor = SHIM_BASE;
  private dataCursor = SHIM_BASE + SHIM_CODE_SIZE;

  private heapCursor = 0n;
  private readonly allocations = new Map<bigint, Allocation>();
  private freeBlocks: FreeBlock[] = [];

  fault: Error | null = null;

  /**
   * Called with each service the guest enters. The guest is an opaque binary,
   * so the call sequence is the only window into what it is doing when a run
   * goes wrong.
   */
  trace: ((name: string) => void) | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    this.engine.memMap(SHIM_BASE, SHIM_SIZE);
    this.registerMemoryServices();
  }

  /** Called by the machine once every service group is registered. */
  installHook(): void {
    this.engine.addCodeHook(SHIM_BASE, SHIM_BASE + SHIM_CODE_SIZE - 1n, (address) => {
      this.dispatch(address);
    });
  }

  private dispatch(address: bigint): void {
    const entry = this.entries.get(address);
    if (!entry) {
      this.fail(new Error(`guest entered unknown service address 0x${address.toString(16)}`));
      return;
    }

    this.trace?.(entry.name);

    try {
      entry.handler();
    } catch (error) {
      this.fail(
        new Error(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  fail(error: Error): void {
    if (!this.fault) this.fault = error;
    this.engine.stop();
  }

  resetFault(): void {
    this.fault = null;
  }

  /** Reserves a slot holding a lone RET and remembers its handler. */
  addFunction(name: string, handler: ShimHandler): bigint {
    const existing = this.symbols.get(name);
    if (existing !== undefined) return existing;

    if (this.codeCursor + SHIM_SLOT_SIZE > SHIM_BASE + SHIM_CODE_SIZE) {
      throw new Error("guest service code area is full");
    }

    const address = this.codeCursor;
    this.codeCursor += SHIM_SLOT_SIZE;

    this.engine.memWrite(address, new Uint8Array([0xc3]));
    this.entries.set(address, { name, handler });
    this.symbols.set(name, address);

    return address;
  }

  addAliases(names: string[], handler: ShimHandler): void {
    for (const name of names) this.addFunction(name, handler);
  }

  addData(name: string, data: Uint8Array): bigint {
    const existing = this.symbols.get(name);
    if (existing !== undefined) return existing;

    this.dataCursor = align(this.dataCursor, 8n);
    if (this.dataCursor + BigInt(data.length) > SHIM_BASE + SHIM_SIZE) {
      throw new Error("guest service data area is full");
    }

    const address = this.dataCursor;
    this.dataCursor += maxBig(BigInt(data.length), 8n);

    this.engine.memWrite(address, data);
    this.symbols.set(name, address);

    return address;
  }

  /** Unknown imports resolve to a stub that only faults when entered. */
  resolve(name: string): bigint {
    const existing = this.symbols.get(name);
    if (existing !== undefined) return existing;

    return this.addFunction(name, () => {
      throw new Error(`guest called unsupported import ${name}`);
    });
  }

  // ---- calling convention -------------------------------------------------

  argument(index: number): bigint {
    const registers = [
      this.engine.regRDI,
      this.engine.regRSI,
      this.engine.regRDX,
      this.engine.regRCX,
      this.engine.regR8,
      this.engine.regR9,
    ];

    if (index < 0) throw new Error("negative guest argument index");
    if (index < registers.length) return this.engine.regRead(registers[index]);

    const stack = this.engine.regRead(this.engine.regRSP);
    return this.engine.readUint64(stack + 8n + BigInt(index - registers.length) * 8n);
  }

  setResult(value: bigint): void {
    this.engine.regWrite(this.engine.regRAX, value & U64_MASK);
  }

  readCString(address: bigint): string {
    const maximum = 4096;
    let text = "";
    for (let offset = 0; offset < maximum; offset++) {
      const byte = this.engine.memRead(address + BigInt(offset), 1)[0];
      if (byte === 0) return text;
      text += String.fromCharCode(byte);
    }
    throw new Error(`guest string exceeds ${maximum} bytes`);
  }

  private checkedSize(value: bigint): number {
    if (value > MAX_GUEST_TRANSFER) {
      throw new Error(`guest transfer size ${value} exceeds limit`);
    }
    return Number(value);
  }

  // ---- allocator ----------------------------------------------------------

  allocate(size: bigint): bigint {
    if (size > MAX_GUEST_TRANSFER) {
      throw new Error(`allocation size ${size} exceeds limit`);
    }

    const reserved = align(maxBig(size, 1n), 16n);

    for (let index = 0; index < this.freeBlocks.length; index++) {
      const block = this.freeBlocks[index];
      if (block.size < reserved) continue;

      const address = block.address;
      if (block.size === reserved) {
        this.freeBlocks.splice(index, 1);
      } else {
        block.address += reserved;
        block.size -= reserved;
      }

      this.allocations.set(address, { size, reserved });
      return address;
    }

    if (this.heapCursor > HEAP_SIZE || reserved > HEAP_SIZE - this.heapCursor) {
      throw new Error("guest heap exhausted");
    }

    const address = HEAP_BASE + this.heapCursor;
    this.heapCursor += reserved;
    this.allocations.set(address, { size, reserved });

    return address;
  }

  release(address: bigint): void {
    const allocation = this.allocations.get(address);
    if (!allocation) {
      throw new Error(`free unknown pointer 0x${address.toString(16)}`);
    }

    this.engine.memZero(address, Number(allocation.reserved));
    this.allocations.delete(address);
    this.freeBlocks.push({ address, size: allocation.reserved });
    this.coalesceFreeBlocks();
  }

  /** Merges adjacent free blocks and gives the tail back to the heap cursor. */
  private coalesceFreeBlocks(): void {
    this.freeBlocks.sort((left, right) => (left.address < right.address ? -1 : 1));

    const merged: FreeBlock[] = [];
    for (const block of this.freeBlocks) {
      const last = merged[merged.length - 1];
      if (last && last.address + last.size === block.address) {
        last.size += block.size;
        continue;
      }
      merged.push({ ...block });
    }

    this.freeBlocks = merged;
    while (this.freeBlocks.length !== 0) {
      const block = this.freeBlocks[this.freeBlocks.length - 1];
      if (block.address + block.size !== HEAP_BASE + this.heapCursor) break;
      this.heapCursor -= block.size;
      this.freeBlocks.pop();
    }
  }

  // ---- memory services ----------------------------------------------------

  private registerMemoryServices(): void {
    this.addAliases(["_malloc"], () => this.setResult(this.allocate(this.argument(0))));

    this.addAliases(["_malloc_good_size"], () =>
      this.setResult(align(maxBig(this.argument(0), 1n), 16n)),
    );

    this.addAliases(["_malloc_size"], () => {
      const allocation = this.allocations.get(this.argument(0));
      this.setResult(allocation ? allocation.reserved : 0n);
    });

    this.addAliases(["_calloc"], () => {
      const count = this.argument(0);
      const size = this.argument(1);
      if (count !== 0n && size > U64_MASK / count) {
        throw new Error("allocation size overflows");
      }

      const total = count * size;
      const address = this.allocate(total);
      if (total !== 0n) this.engine.memZero(address, Number(total));
      this.setResult(address);
    });

    this.addAliases(["_realloc", "_reallocf"], () => this.realloc());

    this.addAliases(["_free"], () => {
      const address = this.argument(0);
      if (address !== 0n) this.release(address);
      this.setResult(0n);
    });

    this.addAliases(["_memcpy", "_memmove"], () => {
      const destination = this.argument(0);
      const source = this.argument(1);
      const length = this.checkedSize(this.argument(2));
      if (length !== 0) {
        this.engine.memWrite(destination, this.engine.memRead(source, length));
      }
      this.setResult(destination);
    });

    this.addAliases(["_memset"], () => {
      const destination = this.argument(0);
      const value = Number(this.argument(1) & 0xffn);
      const length = this.checkedSize(this.argument(2));
      if (length !== 0) {
        this.engine.memWrite(destination, new Uint8Array(length).fill(value));
      }
      this.setResult(destination);
    });

    this.addAliases(["___bzero"], () => {
      const destination = this.argument(0);
      this.engine.memZero(destination, this.checkedSize(this.argument(1)));
      this.setResult(destination);
    });

    // The _chk variants carry the destination's known size as a fourth
    // argument; the guest relies on them trapping an overflow rather than
    // truncating, so refuse instead of clamping.
    this.addAliases(["___memcpy_chk"], () => {
      const destination = this.argument(0);
      const source = this.argument(1);
      const length = this.argument(2);
      if (length > this.argument(3)) {
        throw new Error("__memcpy_chk destination is too small");
      }
      const size = this.checkedSize(length);
      if (size !== 0) {
        this.engine.memWrite(destination, this.engine.memRead(source, size));
      }
      this.setResult(destination);
    });

    this.addAliases(["___memset_chk"], () => {
      const destination = this.argument(0);
      const value = Number(this.argument(1) & 0xffn);
      const length = this.argument(2);
      if (length > this.argument(3)) {
        throw new Error("__memset_chk destination is too small");
      }
      const size = this.checkedSize(length);
      if (size !== 0) {
        this.engine.memWrite(destination, new Uint8Array(size).fill(value));
      }
      this.setResult(destination);
    });

    this.addAliases(["_memcmp"], () => {
      const left = this.argument(0);
      const right = this.argument(1);
      const length = this.checkedSize(this.argument(2));
      this.setResult(BigInt(compareBytes(
        this.engine.memRead(left, length),
        this.engine.memRead(right, length),
      )) & U64_MASK);
    });

    this.addAliases(["_strcmp"], () => {
      const left = this.readCString(this.argument(0));
      const right = this.readCString(this.argument(1));
      this.setResult(BigInt(left < right ? -1 : left > right ? 1 : 0) & U64_MASK);
    });

    this.addAliases(["_strncmp"], () => {
      const limit = Number(this.argument(2));
      const left = this.readCString(this.argument(0)).slice(0, limit);
      const right = this.readCString(this.argument(1)).slice(0, limit);
      this.setResult(BigInt(left < right ? -1 : left > right ? 1 : 0) & U64_MASK);
    });

    this.addAliases(["_strlen"], () =>
      this.setResult(BigInt(this.readCString(this.argument(0)).length)),
    );
  }

  private realloc(): void {
    const oldAddress = this.argument(0);
    const newSize = this.argument(1);

    if (oldAddress === 0n) {
      this.setResult(this.allocate(newSize));
      return;
    }

    const allocation = this.allocations.get(oldAddress);
    if (!allocation) {
      throw new Error(`reallocate unknown pointer 0x${oldAddress.toString(16)}`);
    }

    if (newSize <= allocation.reserved) {
      allocation.size = newSize;
      this.setResult(oldAddress);
      return;
    }

    const newAddress = this.allocate(newSize);
    const size = Number(allocation.size);
    if (size !== 0) {
      this.engine.memWrite(newAddress, this.engine.memRead(oldAddress, size));
    }
    this.release(oldAddress);
    this.setResult(newAddress);
  }
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}
