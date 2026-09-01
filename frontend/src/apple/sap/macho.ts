// Minimal Mach-O loader for the SAP guest images.
//
// Ported from ipatool's internal/sap/machimage. Only what those three images
// need is implemented: the x86-64 slice of a universal binary, LC_SEGMENT_64,
// LC_SYMTAB lookups, and the LC_DYLD_INFO rebase and bind opcode streams.
//
// The Go original leans on go-macho for the opcode walk and reports each
// rebase with the pointer already read out of the file. Reading that pointer
// directly here is equivalent and removes the need to mirror go-macho's
// structures, so the walk only has to yield (segment, offset) pairs.

const FAT_MAGIC = 0xcafebabe;
const MH_MAGIC_64 = 0xfeedfacf;
const CPU_TYPE_X86_64 = 0x01000007;

const LC_SEGMENT_64 = 0x19;
const LC_SYMTAB = 0x02;
const LC_DYLD_INFO = 0x22;
const LC_DYLD_INFO_ONLY = 0x80000022;

const REBASE_TYPE_POINTER = 1;
const BIND_TYPE_POINTER = 1;

const REBASE_OPCODE_MASK = 0xf0;
const REBASE_IMMEDIATE_MASK = 0x0f;
const REBASE_OPCODE_DONE = 0x00;
const REBASE_OPCODE_SET_TYPE_IMM = 0x10;
const REBASE_OPCODE_SET_SEGMENT_AND_OFFSET_ULEB = 0x20;
const REBASE_OPCODE_ADD_ADDR_ULEB = 0x30;
const REBASE_OPCODE_ADD_ADDR_IMM_SCALED = 0x40;
const REBASE_OPCODE_DO_REBASE_IMM_TIMES = 0x50;
const REBASE_OPCODE_DO_REBASE_ULEB_TIMES = 0x60;
const REBASE_OPCODE_DO_REBASE_ADD_ADDR_ULEB = 0x70;
const REBASE_OPCODE_DO_REBASE_ULEB_TIMES_SKIPPING_ULEB = 0x80;

const BIND_OPCODE_MASK = 0xf0;
const BIND_IMMEDIATE_MASK = 0x0f;
const BIND_OPCODE_DONE = 0x00;
const BIND_OPCODE_SET_DYLIB_ORDINAL_IMM = 0x10;
const BIND_OPCODE_SET_DYLIB_ORDINAL_ULEB = 0x20;
const BIND_OPCODE_SET_DYLIB_SPECIAL_IMM = 0x30;
const BIND_OPCODE_SET_SYMBOL_TRAILING_FLAGS_IMM = 0x40;
const BIND_OPCODE_SET_TYPE_IMM = 0x50;
const BIND_OPCODE_SET_ADDEND_SLEB = 0x60;
const BIND_OPCODE_SET_SEGMENT_AND_OFFSET_ULEB = 0x70;
const BIND_OPCODE_ADD_ADDR_ULEB = 0x80;
const BIND_OPCODE_DO_BIND = 0x90;
const BIND_OPCODE_DO_BIND_ADD_ADDR_ULEB = 0xa0;
const BIND_OPCODE_DO_BIND_ADD_ADDR_IMM_SCALED = 0xb0;
const BIND_OPCODE_DO_BIND_ULEB_TIMES_SKIPPING_ULEB = 0xc0;

// Segment offsets are uint64 in the original, and linkers lean on that: a
// backward jump is emitted as a ULEB that wraps, e.g. 0xfffffffffffff6c8 for
// -0x938. BigInt has no width, so every offset step masks back to 64 bits.
const U64_MASK = (1n << 64n) - 1n;

const POINTER_SIZE = 8n;
const PAGE_SIZE = 0x1000n;
const MAX_IMAGE_SPAN = 1n << 30n;

export interface GuestMemory {
  memMap(address: bigint, size: bigint): void;
  memWrite(address: bigint, data: Uint8Array): void;
}

interface Segment {
  name: string;
  address: bigint;
  size: bigint;
  fileOff: bigint;
  fileSize: bigint;
}

interface Fixup {
  segment: number;
  offset: bigint;
}

interface Bind extends Fixup {
  name: string;
  addend: bigint;
  type: number;
}

/** Reads the little-endian primitives the Mach-O structures are made of. */
class Cursor {
  private readonly view: DataView;
  private offset: number;

  constructor(view: DataView, start = 0) {
    this.view = view;
    this.offset = start;
  }

  get position(): number {
    return this.offset;
  }

  atEnd(limit: number): boolean {
    return this.offset >= limit;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  u64(): bigint {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /** LEB128, as used throughout the dyld opcode streams. */
  uleb(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 70n) throw new Error("ULEB128 value is too large");
    }
  }

  sleb(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if ((byte & 0x80) === 0) {
        if (byte & 0x40) result -= 1n << shift;
        return result;
      }
      if (shift > 70n) throw new Error("SLEB128 value is too large");
    }
  }

  cstring(): string {
    let text = "";
    for (;;) {
      const byte = this.u8();
      if (byte === 0) return text;
      text += String.fromCharCode(byte);
    }
  }
}

function align(value: bigint, boundary: bigint): bigint {
  const remainder = value % boundary;
  return remainder === 0n ? value : value + (boundary - remainder);
}

/** Picks the x86-64 member out of a universal binary, or passes a thin one through. */
function amd64Slice(input: Uint8Array): Uint8Array {
  if (input.length < 8) throw new Error("image is too small to be Mach-O");

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(0, false) !== FAT_MAGIC) return input;

  const count = view.getUint32(4, false);
  for (let index = 0; index < count; index++) {
    const entry = 8 + index * 20;
    const cpu = view.getUint32(entry, false);
    if (cpu !== CPU_TYPE_X86_64) continue;

    const offset = view.getUint32(entry + 8, false);
    const size = view.getUint32(entry + 12, false);
    if (offset + size > input.length) {
      throw new Error("x86-64 slice exceeds input size");
    }
    return input.subarray(offset, offset + size);
  }

  throw new Error("universal binary has no x86-64 slice");
}

export class MachImage {
  private readonly data: Uint8Array;
  private readonly view: DataView;
  private readonly segments: Segment[] = [];
  private readonly symbols = new Map<string, bigint>();
  private readonly rebases: Fixup[] = [];
  private readonly binds: Bind[] = [];

  readonly name: string;
  readonly base: bigint;

  private relocated = false;
  private loadedBase = 0n;
  private loadedSpan = 0n;

  constructor(name: string, input: Uint8Array) {
    this.name = name;
    // subarray keeps the parent buffer alive, so copy the slice we keep.
    this.data = new Uint8Array(amd64Slice(input));
    this.view = new DataView(this.data.buffer);

    if (this.view.getUint32(0, true) !== MH_MAGIC_64) {
      throw new Error(`${name} is not a 64-bit Mach-O`);
    }
    if (this.view.getUint32(4, true) !== CPU_TYPE_X86_64) {
      throw new Error(`${name} is not x86-64`);
    }

    this.parseLoadCommands();
    this.base = this.textBase();
    this.validateSegments();
  }

  private parseLoadCommands(): void {
    const count = this.view.getUint32(16, true);
    let offset = 32;

    for (let index = 0; index < count; index++) {
      const command = this.view.getUint32(offset, true);
      const size = this.view.getUint32(offset + 4, true);
      if (size === 0) throw new Error(`${this.name} has a zero-length load command`);

      if (command === LC_SEGMENT_64) {
        this.parseSegment(offset);
      } else if (command === LC_SYMTAB) {
        this.parseSymtab(offset);
      } else if (command === LC_DYLD_INFO || command === LC_DYLD_INFO_ONLY) {
        this.parseDyldInfo(offset);
      }

      offset += size;
    }
  }

  private parseSegment(offset: number): void {
    let name = "";
    for (let index = 0; index < 16; index++) {
      const byte = this.view.getUint8(offset + 8 + index);
      if (byte === 0) break;
      name += String.fromCharCode(byte);
    }

    this.segments.push({
      name,
      address: this.view.getBigUint64(offset + 24, true),
      size: this.view.getBigUint64(offset + 32, true),
      fileOff: this.view.getBigUint64(offset + 40, true),
      fileSize: this.view.getBigUint64(offset + 48, true),
    });
  }

  private parseSymtab(offset: number): void {
    const symbolOffset = this.view.getUint32(offset + 8, true);
    const symbolCount = this.view.getUint32(offset + 12, true);
    const stringOffset = this.view.getUint32(offset + 16, true);
    const stringSize = this.view.getUint32(offset + 20, true);

    for (let index = 0; index < symbolCount; index++) {
      const entry = symbolOffset + index * 16;
      if (entry + 16 > this.data.length) break;

      const nameOffset = this.view.getUint32(entry, true);
      const type = this.view.getUint8(entry + 4);
      const value = this.view.getBigUint64(entry + 8, true);

      // N_STAB entries are debug symbols; N_TYPE must be N_SECT to have an
      // address worth resolving.
      if (type & 0xe0) continue;
      if ((type & 0x0e) !== 0x0e) continue;
      if (nameOffset === 0 || nameOffset >= stringSize) continue;

      let symbol = "";
      let cursor = stringOffset + nameOffset;
      while (cursor < this.data.length) {
        const byte = this.data[cursor++];
        if (byte === 0) break;
        symbol += String.fromCharCode(byte);
      }

      if (symbol && !this.symbols.has(symbol)) this.symbols.set(symbol, value);
    }
  }

  private parseDyldInfo(offset: number): void {
    const rebaseOff = this.view.getUint32(offset + 8, true);
    const rebaseSize = this.view.getUint32(offset + 12, true);
    const bindOff = this.view.getUint32(offset + 16, true);
    const bindSize = this.view.getUint32(offset + 20, true);
    const weakBindOff = this.view.getUint32(offset + 24, true);
    const weakBindSize = this.view.getUint32(offset + 28, true);
    const lazyBindOff = this.view.getUint32(offset + 32, true);
    const lazyBindSize = this.view.getUint32(offset + 36, true);

    if (rebaseSize > 0) this.walkRebase(rebaseOff, rebaseOff + rebaseSize);
    if (bindSize > 0) this.walkBind(bindOff, bindOff + bindSize, false);
    if (weakBindSize > 0) this.walkBind(weakBindOff, weakBindOff + weakBindSize, false);
    if (lazyBindSize > 0) this.walkBind(lazyBindOff, lazyBindOff + lazyBindSize, true);
  }

  private walkRebase(start: number, end: number): void {
    const cursor = new Cursor(this.view, start);
    let type = 0;
    let segment = 0;
    let offset = 0n;

    const emit = (count: bigint, skip: bigint) => {
      for (let index = 0n; index < count; index++) {
        if (type !== REBASE_TYPE_POINTER) {
          throw new Error(`${this.name} uses unsupported rebase type ${type}`);
        }
        this.rebases.push({ segment, offset });
        offset = (offset + POINTER_SIZE + skip) & U64_MASK;
      }
    };

    while (!cursor.atEnd(end)) {
      const byte = cursor.u8();
      const opcode = byte & REBASE_OPCODE_MASK;
      const immediate = byte & REBASE_IMMEDIATE_MASK;

      switch (opcode) {
        case REBASE_OPCODE_DONE:
          return;
        case REBASE_OPCODE_SET_TYPE_IMM:
          type = immediate;
          break;
        case REBASE_OPCODE_SET_SEGMENT_AND_OFFSET_ULEB:
          segment = immediate;
          offset = cursor.uleb() & U64_MASK;
          break;
        case REBASE_OPCODE_ADD_ADDR_ULEB:
          offset = (offset + cursor.uleb()) & U64_MASK;
          break;
        case REBASE_OPCODE_ADD_ADDR_IMM_SCALED:
          offset = (offset + BigInt(immediate) * POINTER_SIZE) & U64_MASK;
          break;
        case REBASE_OPCODE_DO_REBASE_IMM_TIMES:
          emit(BigInt(immediate), 0n);
          break;
        case REBASE_OPCODE_DO_REBASE_ULEB_TIMES:
          emit(cursor.uleb(), 0n);
          break;
        case REBASE_OPCODE_DO_REBASE_ADD_ADDR_ULEB: {
          const skip = cursor.uleb();
          emit(1n, skip);
          break;
        }
        case REBASE_OPCODE_DO_REBASE_ULEB_TIMES_SKIPPING_ULEB: {
          const count = cursor.uleb();
          const skip = cursor.uleb();
          emit(count, skip);
          break;
        }
        default:
          throw new Error(`${this.name} uses unknown rebase opcode ${opcode}`);
      }
    }
  }

  // A lazy stream uses DONE to separate one symbol's sequence from the next
  // and runs to the end of its range; the regular and weak streams end at the
  // first DONE, with padding after it that must not be parsed.
  private walkBind(start: number, end: number, lazy: boolean): void {
    const cursor = new Cursor(this.view, start);
    // Lazy bind streams may omit SET_TYPE; dyld's default is a pointer bind.
    let type = BIND_TYPE_POINTER;
    let segment = 0;
    let offset = 0n;
    let addend = 0n;
    let symbol = "";

    const emit = (skip: bigint) => {
      if (type !== BIND_TYPE_POINTER) {
        throw new Error(`${this.name} uses unsupported bind type ${type} for ${symbol}`);
      }
      this.binds.push({ segment, offset, name: symbol, addend, type });
      offset = (offset + POINTER_SIZE + skip) & U64_MASK;
    };

    while (!cursor.atEnd(end)) {
      const byte = cursor.u8();
      const opcode = byte & BIND_OPCODE_MASK;
      const immediate = byte & BIND_IMMEDIATE_MASK;

      switch (opcode) {
        case BIND_OPCODE_DONE:
          if (!lazy) return;
          break;
        case BIND_OPCODE_SET_DYLIB_ORDINAL_IMM:
        case BIND_OPCODE_SET_DYLIB_SPECIAL_IMM:
          break;
        case BIND_OPCODE_SET_DYLIB_ORDINAL_ULEB:
          cursor.uleb();
          break;
        case BIND_OPCODE_SET_SYMBOL_TRAILING_FLAGS_IMM:
          symbol = cursor.cstring();
          break;
        case BIND_OPCODE_SET_TYPE_IMM:
          type = immediate;
          break;
        case BIND_OPCODE_SET_ADDEND_SLEB:
          addend = cursor.sleb();
          break;
        case BIND_OPCODE_SET_SEGMENT_AND_OFFSET_ULEB:
          segment = immediate;
          offset = cursor.uleb() & U64_MASK;
          break;
        case BIND_OPCODE_ADD_ADDR_ULEB:
          offset = (offset + cursor.uleb()) & U64_MASK;
          break;
        case BIND_OPCODE_DO_BIND:
          emit(0n);
          break;
        case BIND_OPCODE_DO_BIND_ADD_ADDR_ULEB:
          emit(cursor.uleb());
          break;
        case BIND_OPCODE_DO_BIND_ADD_ADDR_IMM_SCALED:
          emit(BigInt(immediate) * POINTER_SIZE);
          break;
        case BIND_OPCODE_DO_BIND_ULEB_TIMES_SKIPPING_ULEB: {
          const count = cursor.uleb();
          const skip = cursor.uleb();
          for (let index = 0n; index < count; index++) emit(skip);
          break;
        }
        default:
          throw new Error(`${this.name} uses unknown bind opcode ${opcode}`);
      }
    }
  }

  private textBase(): bigint {
    for (const item of this.segments) {
      if (item.name === "__TEXT") return item.address;
    }
    throw new Error(`${this.name} has no __TEXT segment`);
  }

  private validateSegments(): void {
    for (const item of this.segments) {
      if (item.fileSize > item.size) {
        throw new Error(`segment ${item.name} file data exceeds its memory size in ${this.name}`);
      }
      if (item.fileOff + item.fileSize > BigInt(this.data.length)) {
        throw new Error(`segment ${item.name} data exceeds ${this.name}`);
      }
    }
  }

  /** File offset of a fixup, with the same bounds checks as the Go original. */
  private segmentFileOffset(index: number, offset: bigint, size: bigint): bigint {
    const item = this.segments[index];
    if (!item) {
      throw new Error(`fixup references unknown segment ${index} in ${this.name}`);
    }

    const end = offset + size;
    if (end > item.size) {
      throw new Error(`fixup at ${offset} exceeds segment ${item.name} in ${this.name}`);
    }
    if (end > item.fileSize) {
      throw new Error(`fixup at ${offset} exceeds file data for segment ${item.name} in ${this.name}`);
    }

    return item.fileOff + offset;
  }

  private putPointer(offset: bigint, value: bigint): void {
    this.view.setBigUint64(Number(offset), value, true);
  }

  /** Absolute guest address of an exported symbol once loaded at loadBase. */
  export(name: string, loadBase: bigint): bigint {
    const address = this.symbols.get(name);
    if (address === undefined) {
      throw new Error(`find ${name} in ${this.name}`);
    }
    if (address < this.base) {
      throw new Error(`symbol ${name} in ${this.name} precedes image base`);
    }
    return loadBase + (address - this.base);
  }

  /** Applies rebases and binds in place, exactly as machimage.Relocate does. */
  relocate(loadBase: bigint, resolve: (symbol: string) => bigint): void {
    if (this.relocated) {
      throw new Error(`${this.name} is already relocated`);
    }

    for (const item of this.rebases) {
      const offset = this.segmentFileOffset(item.segment, item.offset, POINTER_SIZE);
      const original = this.view.getBigUint64(Number(offset), true);
      if (original < this.base) {
        throw new Error(`${this.name} contains a rebase below its image base`);
      }
      this.putPointer(offset, loadBase + (original - this.base));
    }

    for (const item of this.binds) {
      const offset = this.segmentFileOffset(item.segment, item.offset, POINTER_SIZE);
      this.putPointer(offset, resolve(item.name) + item.addend);
    }

    this.relocated = true;
    this.loadedBase = loadBase;
  }

  /** Maps the image span and writes every segment's file data into the guest. */
  load(memory: GuestMemory): void {
    if (!this.relocated) {
      throw new Error(`${this.name} must be relocated before loading`);
    }

    let span = 0n;
    for (const item of this.segments) {
      if (item.name === "__PAGEZERO" || item.size === 0n) continue;
      if (item.address < this.base) {
        throw new Error(`segment ${item.name} in ${this.name} precedes image base`);
      }

      const end = item.address - this.base + item.size;
      if (end > MAX_IMAGE_SPAN) {
        throw new Error(`segment ${item.name} makes ${this.name} too large`);
      }
      if (end > span) span = end;
    }

    span = align(span, PAGE_SIZE);
    if (span === 0n) {
      throw new Error(`${this.name} has no loadable segments`);
    }

    memory.memMap(this.loadedBase, span);
    this.loadedSpan = span;

    for (const item of this.segments) {
      if (item.name === "__PAGEZERO" || item.fileSize === 0n) continue;

      const start = Number(item.fileOff);
      const end = Number(item.fileOff + item.fileSize);
      memory.memWrite(
        this.loadedBase + (item.address - this.base),
        this.data.subarray(start, end),
      );
    }
  }

  loadedRange(): { base: bigint; span: bigint } {
    return { base: this.loadedBase, span: this.loadedSpan };
  }
}
