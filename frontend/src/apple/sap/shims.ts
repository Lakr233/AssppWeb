// Guest service shims for the SAP machine: libc memory functions plus the
// CoreFoundation/IOKit/objc surface the emulated CommerceKit code touches.
// Ported from ipatool's internal/sap/machine (shim_memory.go, shim_platform.go,
// shims.go). Imports resolve to 16-byte stub slots holding a single RET; a code
// hook over the shim area dispatches on the entry address.

import { UnicornEngine, X86_REG } from "./engine";

const SHIM_BASE = 0x0000200000000000;
const SHIM_CODE_SIZE = 0x80000;
const SHIM_SIZE = 0x100000;
const SHIM_SLOT_SIZE = 16;

const MAX_GUEST_TRANSFER = 64 << 20;
const PAGE_SIZE = 0x1000;

// machine.go memory layout (heap area is managed by the malloc shims).
export const HEAP_BASE = 0x0000400000000000;
export const HEAP_SIZE = 64 << 20;

// Passed through regWrite as -1: wasm's saturating f64->i64 conversion turns
// -1 into the full 64-bit 0xFFFF...F (Go's math.MaxUint64), which cannot be
// represented exactly as a JS number.
const FAKE_HANDLE = -1;
const CORE_FP_FILE = 3;
const CORE_FP_PATH = "/System/Library/PrivateFrameworks/CoreFP.framework/CoreFP";
const ICXS_PATH = "./../CoreFP.icxs";
const KEY_SERIAL = "IOPlatformSerialNumber";
const KEY_UUID = "IOPlatformUUID";
const KEY_BOARD = "board-id";
const KEYED_MESSAGE = "objectForKey:";

interface GuestAllocation {
  size: number;
  reserved: number;
}

interface FreeBlock {
  address: number;
  size: number;
}

type ShimHandler = () => void;

function align(value: number, alignment: number): number {
  // Math-based: JS bitwise ops are 32-bit and truncate SAP guest addresses.
  return Math.floor((value + alignment - 1) / alignment) * alignment;
}

export class Shims {
  private readonly entries = new Map<number, string>();
  private readonly handlers = new Map<number, ShimHandler>();
  readonly symbols = new Map<string, number>();
  private codeCursor = SHIM_BASE;
  private dataCursor = SHIM_BASE + SHIM_CODE_SIZE;
  fault: Error | null = null;
  private readonly coreExports: Map<string, number>;
  private readonly icxs: Uint8Array;
  private icxsOffset = 0;
  private errnoAddress = 0;
  private heapCursor = 0;
  private readonly allocations = new Map<number, GuestAllocation>();
  private freeBlocks: FreeBlock[] = [];
  private iterator = 0;
  private hookHandle = 0;

  private constructor(
    private readonly engine: UnicornEngine,
    coreExports: Record<string, number>,
    icxs: Uint8Array,
  ) {
    this.coreExports = new Map(Object.entries(coreExports));
    this.icxs = icxs;
  }

  static async open(
    engine: UnicornEngine,
    coreExports: Record<string, number>,
    icxs: Uint8Array,
  ): Promise<Shims> {
    engine.memMap(SHIM_BASE, SHIM_SIZE);

    const shims = new Shims(engine, coreExports, icxs);
    shims.registerMemoryServices();
    shims.registerPlatformServices();

    engine.attachCodeHook();
    engine.onCodeHook = (address) => shims.dispatch(address);
    shims.hookHandle = engine.addCodeHook(
      SHIM_BASE,
      SHIM_BASE + SHIM_CODE_SIZE - 1,
    );

    return shims;
  }

  close(): void {
    if (this.hookHandle) {
      this.engine.hookDel(this.hookHandle);
    }
  }

  resolve(name: string): number {
    const existing = this.symbols.get(name);
    if (existing !== undefined) {
      return existing;
    }
    return this.addFunction(name, () => {
      throw new Error(`guest called unsupported import ${name}`);
    });
  }

  private addAliases(names: string[], handler: ShimHandler): void {
    for (const name of names) {
      this.addFunction(name, handler);
    }
  }

  private addFunction(name: string, handler: ShimHandler): number {
    const existing = this.symbols.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (this.codeCursor + SHIM_SLOT_SIZE > SHIM_BASE + SHIM_CODE_SIZE) {
      throw new Error("guest service code area is full");
    }

    const address = this.codeCursor;
    this.codeCursor += SHIM_SLOT_SIZE;

    this.engine.memWrite(address, new Uint8Array([0xc3])); // RET

    this.entries.set(address, name);
    this.handlers.set(address, handler);
    this.symbols.set(name, address);
    return address;
  }

  private addData(name: string, data: Uint8Array): number {
    const existing = this.symbols.get(name);
    if (existing !== undefined) {
      return existing;
    }
    this.dataCursor = align(this.dataCursor, 8);
    if (this.dataCursor + data.length > SHIM_BASE + SHIM_SIZE) {
      throw new Error("guest service data area is full");
    }
    const address = this.dataCursor;
    this.dataCursor += Math.max(data.length, 8);
    this.engine.memWrite(address, data);
    this.symbols.set(name, address);
    return address;
  }

  dispatch(address: number): void {
    const handler = this.handlers.get(address);
    if (!handler) {
      this.fail(new Error(`guest entered unknown service address ${address.toString(16)}`));
      return;
    }
    try {
      handler();
    } catch (error) {
      this.fail(
        new Error(
          `${this.entries.get(address) ?? "shim"}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private fail(error: Error): void {
    if (!this.fault) {
      this.fault = error;
    }
    try {
      this.engine.emuStop();
    } catch {
      // stopping an already-stopped engine is fine
    }
  }

  resetFault(): void {
    this.fault = null;
  }

  private argument(index: number): number {
    const registers = [
      X86_REG.RDI,
      X86_REG.RSI,
      X86_REG.RDX,
      X86_REG.RCX,
      X86_REG.R8,
      X86_REG.R9,
    ];
    if (index >= 0 && index < registers.length) {
      return this.engine.regRead(registers[index]);
    }
    if (index < 0) {
      throw new Error("negative guest argument index");
    }
    const stack = this.engine.regRead(X86_REG.RSP);
    const data = this.engine.memRead(stack + 8 + (index - registers.length) * 8, 8);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return Number(view.getBigUint64(0, true));
  }

  private setResult(value: number): void {
    this.engine.regWrite(X86_REG.RAX, value);
  }

  private readUint32(address: number): number {
    const data = this.engine.memRead(address, 4);
    return new DataView(data.buffer, data.byteOffset).getUint32(0, true);
  }

  private writeUint32(address: number, value: number): void {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, value, true);
    this.engine.memWrite(address, data);
  }

  private readUint64(address: number): number {
    const data = this.engine.memRead(address, 8);
    return Number(
      new DataView(data.buffer, data.byteOffset).getBigUint64(0, true),
    );
  }

  private writeUint64(address: number, value: number): void {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setBigUint64(0, BigInt(value), true);
    this.engine.memWrite(address, data);
  }

  readCString(address: number): string {
    const maximum = 4096;
    const value: number[] = [];
    while (value.length < maximum) {
      const item = this.engine.memRead(address + value.length, 1)[0];
      if (item === 0) {
        return String.fromCharCode(...value);
      }
      value.push(item);
    }
    throw new Error(`guest string exceeds ${maximum} bytes`);
  }

  private checkedSize(value: number): number {
    if (value > MAX_GUEST_TRANSFER) {
      throw new Error(`guest transfer size ${value} exceeds limit`);
    }
    return value;
  }

  // ---- memory services ----

  private registerMemoryServices(): void {
    this.addAliases(["_malloc"], () => {
      const size = this.argument(0);
      this.setResult(this.allocate(size));
    });
    this.addAliases(["_malloc_good_size"], () => {
      const size = this.argument(0);
      this.setResult(align(Math.max(size, 1), 16));
    });
    this.addAliases(["_malloc_size"], () => {
      const address = this.argument(0);
      const allocation = this.allocations.get(address);
      this.setResult(allocation ? allocation.reserved : 0);
    });
    this.addAliases(["_calloc"], () => {
      const count = this.argument(0);
      const size = this.argument(1);
      const total = count * size;
      const address = this.allocate(total);
      if (total !== 0) {
        this.engine.memWrite(address, new Uint8Array(total));
      }
      this.setResult(address);
    });
    this.addAliases(["_realloc", "_reallocf"], () => {
      this.realloc();
    });
    this.addAliases(["_free"], () => {
      const address = this.argument(0);
      if (address !== 0) {
        this.release(address);
      }
      this.setResult(0);
    });
    this.addAliases(["_memcpy", "_memmove"], () => {
      this.memmove();
    });
    this.addAliases(["_memset"], () => {
      this.memset();
    });
    this.addAliases(["___bzero"], () => {
      this.bzero();
    });
    this.addAliases(["___memcpy_chk"], () => {
      const length = this.argument(2);
      const capacity = this.argument(3);
      if (length > capacity) {
        throw new Error("checked copy exceeds destination");
      }
      this.memmove();
    });
    this.addAliases(["___memset_chk"], () => {
      const length = this.argument(2);
      const capacity = this.argument(3);
      if (length > capacity) {
        throw new Error("checked fill exceeds destination");
      }
      this.memset();
    });
    this.addAliases(["_memcmp"], () => {
      const left = this.argument(0);
      const right = this.argument(1);
      const length = this.checkedSize(this.argument(2));
      const a = this.engine.memRead(left, length);
      const b = this.engine.memRead(right, length);
      let order = 0;
      for (let index = 0; index < length; index++) {
        if (a[index] !== b[index]) {
          order = a[index] < b[index] ? -1 : 1;
          break;
        }
      }
      this.setResult(order >>> 0);
    });
    this.addAliases(["_strcmp"], () => {
      const left = this.readCString(this.argument(0));
      const right = this.readCString(this.argument(1));
      this.setResult(left < right ? -1 : left > right ? 1 : 0);
    });
    this.addAliases(["_strncmp"], () => {
      this.strncmp();
    });
    this.addAliases(["_strlen"], () => {
      const value = this.readCString(this.argument(0));
      this.setResult(value.length);
    });
  }

  private allocate(size: number): number {
    if (size > MAX_GUEST_TRANSFER) {
      throw new Error(`allocation size ${size} exceeds limit`);
    }
    const reserved = align(Math.max(size, 1), 16);
    for (let index = 0; index < this.freeBlocks.length; index++) {
      const block = this.freeBlocks[index];
      if (block.size < reserved) {
        continue;
      }
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

  private release(address: number): void {
    const allocation = this.allocations.get(address);
    if (!allocation) {
      throw new Error(`free unknown pointer ${address.toString(16)}`);
    }
    this.engine.memWrite(address, new Uint8Array(allocation.reserved));
    this.allocations.delete(address);
    this.freeBlocks.push({ address, size: allocation.reserved });
    this.coalesceFreeBlocks();
  }

  private coalesceFreeBlocks(): void {
    this.freeBlocks.sort((left, right) => left.address - right.address);
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
      const last = this.freeBlocks[this.freeBlocks.length - 1];
      if (last.address + last.size !== HEAP_BASE + this.heapCursor) {
        break;
      }
      this.heapCursor -= last.size;
      this.freeBlocks.pop();
    }
  }

  private realloc(): void {
    const oldAddress = this.argument(0);
    const newSize = this.argument(1);
    if (oldAddress === 0) {
      this.setResult(this.allocate(newSize));
      return;
    }
    const oldAllocation = this.allocations.get(oldAddress);
    if (!oldAllocation) {
      throw new Error(`reallocate unknown pointer ${oldAddress.toString(16)}`);
    }
    if (newSize <= oldAllocation.reserved) {
      oldAllocation.size = newSize;
      this.setResult(oldAddress);
      return;
    }
    const newAddress = this.allocate(newSize);
    const data = this.engine.memRead(oldAddress, oldAllocation.size);
    this.engine.memWrite(newAddress, data);
    this.release(oldAddress);
    this.setResult(newAddress);
  }

  private memmove(): void {
    const destination = this.argument(0);
    const source = this.argument(1);
    const length = this.checkedSize(this.argument(2));
    if (length !== 0) {
      const data = this.engine.memRead(source, length);
      this.engine.memWrite(destination, data);
    }
    this.setResult(destination);
  }

  private memset(): void {
    const destination = this.argument(0);
    const value = this.argument(1);
    const size = this.checkedSize(this.argument(2));
    this.engine.memWrite(destination, new Uint8Array(size).fill(value & 0xff));
    this.setResult(destination);
  }

  private bzero(): void {
    const destination = this.argument(0);
    const size = this.checkedSize(this.argument(1));
    this.engine.memWrite(destination, new Uint8Array(size));
    this.setResult(destination);
  }

  private strncmp(): void {
    const left = this.argument(0);
    const right = this.argument(1);
    const length = this.checkedSize(this.argument(2));
    for (let offset = 0; offset < length; ) {
      const leftAddress = left + offset;
      const rightAddress = right + offset;
      const chunk = Math.min(
        length - offset,
        PAGE_SIZE - (leftAddress % PAGE_SIZE),
        PAGE_SIZE - (rightAddress % PAGE_SIZE),
      );
      const a = this.engine.memRead(leftAddress, chunk);
      const b = this.engine.memRead(rightAddress, chunk);
      for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
          this.setResult((a[index] - b[index]) >>> 0);
          return;
        }
        if (a[index] === 0) {
          this.setResult(0);
          return;
        }
      }
      offset += chunk;
    }
    this.setResult(0);
  }

  // ---- platform services ----

  private registerPlatformServices(): void {
    this.addAliases(
      [
        "_CFBundleGetMainBundle",
        "_CFDataGetBytePtr",
        "_CFDataGetLength",
        "_CFStringGetLength",
        "_CFStringGetMaximumSizeForEncoding",
        "_CFUUIDCreateString",
        "_IORegistryEntryFromPath",
        "_IORegistryEntrySearchCFProperty",
        "_IOServiceMatching",
        "_getenv",
        "_pthread_self",
      ],
      () => this.setResult(0),
    );
    this.addAliases(
      [
        "_CFDictionaryGetValue",
        "_DADiskCopyDescription",
        "_DADiskCreateFromBSDName",
        "_DASessionCreate",
        "_IORegistryEntryCreateCFProperty",
      ],
      () => this.setResult(FAKE_HANDLE),
    );
    this.addAliases(
      [
        "_CFRelease",
        "_IOObjectRelease",
        "_close",
        "_close$UNIX2003",
        "_pthread_mutex_lock",
        "_pthread_mutex_unlock",
        "_pthread_rwlock_init",
        "_pthread_rwlock_init$UNIX2003",
        "_pthread_rwlock_unlock",
        "_pthread_rwlock_unlock$UNIX2003",
        "_pthread_rwlock_wrlock",
        "_pthread_rwlock_wrlock$UNIX2003",
      ],
      () => this.setResult(0),
    );
    this.addAliases(["_CFStringCreateWithCString"], () => {
      const value = this.readCString(this.argument(1));
      this.setResult(
        value === KEY_SERIAL || value === KEY_UUID || value === KEY_BOARD
          ? FAKE_HANDLE
          : 0,
      );
    });
    this.addAliases(["_CFStringCreateWithCStringNoCopy"], () => {
      this.setResult(0);
    });
    this.addAliases(["_CFStringGetCString"], () => {
      const buffer = this.argument(1);
      const capacity = this.argument(2);
      if (buffer === 0 || capacity === 0) {
        this.setResult(0);
        return;
      }
      this.engine.memWrite(buffer, new Uint8Array([0]));
      this.setResult(1);
    });
    this.addAliases(["_IOIteratorNext"], () => {
      this.iterator = (this.iterator + 1) >>> 0;
      this.setResult(this.iterator % 2);
    });
    this.addAliases(["_IORegistryEntryGetParentEntry"], () => {
      const parent = this.argument(2);
      if (parent === 0) {
        throw new Error("parent registry entry output is null");
      }
      this.writeUint32(parent, 0xffffffff);
      this.setResult(0);
    });
    this.addAliases(["_IOServiceGetMatchingServices"], () => {
      const iterator = this.argument(2);
      if (iterator === 0) {
        throw new Error("matching services iterator output is null");
      }
      this.iterator = 0;
      this.writeUint32(iterator, 0xffffffff);
      this.setResult(0);
    });
    this.addAliases(["_IOServiceGetMatchingService"], () => {
      this.setResult(0xffffffff); // uc returns uint32 max per Go reference
    });
    this.addAliases(["_OSAtomicCompareAndSwap32Barrier"], () => {
      const oldValue = this.argument(0);
      const newValue = this.argument(1);
      const address = this.argument(2);
      const current = this.readUint32(address);
      if (current !== oldValue) {
        this.setResult(0);
        return;
      }
      this.writeUint32(address, newValue >>> 0);
      this.setResult(1);
    });
    this.addAliases(["___error"], () => {
      this.setResult(this.errnoAddress);
    });
    this.addAliases(["_abort", "___stack_chk_fail", "dyld_stub_binder"], () => {
      throw new Error("guest aborted");
    });
    this.addAliases(["_arc4random"], () => {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      this.setResult(value[0]);
    });
    this.addAliases(["_dlopen"], () => {
      const path = this.readCString(this.argument(0));
      this.setResult(path === CORE_FP_PATH ? FAKE_HANDLE : 0);
    });
    this.addAliases(["_dlsym"], () => {
      const name = this.readCString(this.argument(1));
      this.setResult(this.coreExports.get(`_${name}`) ?? 0);
    });
    this.addAliases(
      ["_fcntl", "_fcntl$UNIX2003", "_lstat$INODE64", "_statfs", "_statfs$INODE64"],
      () => this.setResult(-1), // 64-bit -1 (see FAKE_HANDLE note)
    );
    this.addAliases(["_gettimeofday"], () => {
      this.gettimeofday();
    });
    this.addAliases(["_objc_msgSend"], () => {
      const selector = this.readCString(this.argument(1));
      this.setResult(selector === KEYED_MESSAGE ? FAKE_HANDLE : 0);
    });
    this.addAliases(["_open", "_open$UNIX2003"], () => {
      const path = this.readCString(this.argument(0));
      if (path === ICXS_PATH) {
        this.icxsOffset = 0;
        this.setResult(CORE_FP_FILE);
        return;
      }
      this.setResult(-1); // open() returns int -1
    });
    this.addAliases(["_pthread_once"], () => {
      this.pthreadOnce();
    });
    this.addAliases(["_read", "_read$UNIX2003"], () => {
      this.read();
    });
    this.addAliases(["_sysctl"], () => {
      this.setResult(-1); // 64-bit -1
    });
    this.addAliases(["_sysctlbyname"], () => {
      const lengthAddress = this.argument(2);
      if (lengthAddress !== 0) {
        this.writeUint64(lengthAddress, 0);
      }
      this.setResult(0);
    });

    this.errnoAddress = this.addData("guest.errno", new Uint8Array(8));
    this.addData(
      "___stack_chk_guard",
      new Uint8Array([0xa5, 0x71, 0x3c, 0xd9, 0x86, 0x42, 0xef, 0x10]),
    );
    for (const name of [
      "_kCFAllocatorDefault",
      "_kCFAllocatorNull",
      "_kDADiskDescriptionVolumeUUIDKey",
      "_kIOMasterPortDefault",
    ]) {
      this.addData(name, new Uint8Array(8));
    }
  }

  private gettimeofday(): void {
    const timeAddress = this.argument(0);
    const zoneAddress = this.argument(1);
    const now = Date.now();
    if (timeAddress !== 0) {
      const data = new Uint8Array(16);
      const view = new DataView(data.buffer);
      view.setBigUint64(0, BigInt(Math.floor(now / 1000)), true);
      view.setUint32(8, (now % 1000) * 1000, true);
      this.engine.memWrite(timeAddress, data);
    }
    if (zoneAddress !== 0) {
      this.engine.memWrite(zoneAddress, new Uint8Array(8));
    }
    this.setResult(0);
  }

  private pthreadOnce(): void {
    const control = this.argument(0);
    const initializer = this.argument(1);
    const value = this.readUint64(control);
    if (value === 0) {
      this.setResult(0);
      return;
    }
    this.writeUint64(control, 0);
    const stack = this.engine.regRead(X86_REG.RSP) - 8;
    this.writeUint64(stack, initializer);
    this.engine.regWrite(X86_REG.RSP, stack);
    this.setResult(0);
  }

  private read(): void {
    const descriptor = this.argument(0);
    const buffer = this.argument(1);
    const requested = this.argument(2);
    if (descriptor !== CORE_FP_FILE) {
      this.setResult(-1); // 64-bit -1
      return;
    }
    const size = this.checkedSize(requested);
    const remaining = this.icxs.length - this.icxsOffset;
    const count = Math.min(size, remaining);
    if (count !== 0) {
      this.engine.memWrite(
        buffer,
        this.icxs.subarray(this.icxsOffset, this.icxsOffset + count),
      );
      this.icxsOffset += count;
    }
    this.setResult(count);
  }
}
