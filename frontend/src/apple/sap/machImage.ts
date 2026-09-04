// Minimal Mach-O (x86_64) image parser/relocator for the SAP guest images.
// Ported from ipatool's internal/sap/machimage (which uses blacktop/go-macho).
//
// Supports exactly what the SAP guest needs: fat-binary slicing, LC_SEGMENT_64,
// LC_SYMTAB symbol lookup, and classic dyld_info rebase/bind/weak/lazy fixups.

const MACHO_MAGIC_64 = 0xfeedfacf;
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const CPU_TYPE_X86_64 = 0x01000007;

const LC_SYMTAB = 0x2;
const LC_SEGMENT_64 = 0x19;
const LC_DYLD_INFO = 0x22;
const LC_DYLD_INFO_ONLY = 0x80000022;

const REBASE_TYPE_POINTER = 1;

const BIND_TYPE_POINTER = 1;

const PAGE_SIZE = 0x1000;
const MAX_IMAGE_SPAN = 1 << 30;
const POINTER_SIZE = 8;

interface Segment {
  name: string;
  address: number;
  size: number;
  fileOff: number;
  fileSize: number;
}

export interface MachBind {
  segment: string;
  segOffset: number;
  name: string;
  type: number;
  addend: number;
}

interface MachRebase {
  segment: string;
  offset: number;
  type: number;
  value: number;
}

interface Symbol {
  name: string;
  value: number;
}

export interface GuestMemory {
  memMap(address: number, size: number): void;
  memWrite(address: number, data: Uint8Array): void;
}

function readCString(view: DataView, offset: number): string {
  let end = offset;
  const limit = view.byteLength;
  while (end < limit && view.getUint8(end) !== 0) {
    end++;
  }
  const bytes = new Uint8Array(
    view.buffer,
    view.byteOffset + offset,
    end - offset,
  );
  return new TextDecoder("latin1").decode(bytes);
}

function align(value: number, alignment: number): number {
  // Math-based: JS bitwise ops are 32-bit and truncate SAP guest addresses.
  return Math.floor((value + alignment - 1) / alignment) * alignment;
}

class UlebReader {
  private offset: number;

  constructor(
    private readonly view: DataView,
    start: number,
    private readonly end: number,
  ) {
    this.offset = start;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.end - this.offset;
  }

  readUleb(): number {
    // Returns the uleb128 value wrapped to uint64, as a JS number (exact up
    // to 2^53; larger values keep only their low bits' magnitude and are only
    // used for address arithmetic in segments < 2^48). Callers that must
    // distinguish negative deltas (bind ADD_ADDR_ULEB) use readUlebBig.
    return Number(this.readUlebBig());
  }

  readUlebBig(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.readByte();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return BigInt.asUintN(64, result);
      }
      shift += 7n;
      if (shift > 63n) {
        throw new Error("dyld uleb overflow");
      }
    }
  }

  readSleb(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.readByte();
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) {
        if (shift < 64 && (byte & 0x40) !== 0) {
          result |= -1 << shift;
        }
        break;
      }
      if (shift > 63) {
        throw new Error("dyld sleb overflow");
      }
    }
    return result;
  }

  readCString(): string {
    const bytes: number[] = [];
    for (;;) {
      const byte = this.readByte();
      if (byte === 0) {
        break;
      }
      bytes.push(byte);
      if (bytes.length > 4096) {
        throw new Error("dyld symbol name exceeds 4096 bytes");
      }
    }
    return String.fromCharCode(...bytes);
  }

  readByte(): number {
    if (this.offset >= this.end) {
      throw new Error("dyld opcode stream truncated");
    }
    return this.view.getUint8(this.offset++);
  }
}

export class MachImage {
  private base: number;
  private segments: Segment[] = [];
  private symbols: Map<string, number> = new Map();
  private rebases: MachRebase[] = [];
  private binds: MachBind[] = [];
  private relocated = false;
  private loadedBase = 0;

  private constructor(
    public readonly name: string,
    private readonly data: Uint8Array,
  ) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const header = this.parseHeader(view);
    this.base = header.base;
    this.segments = header.segments;
    this.parseSymtab(view, header.symtab);
    this.rebases = this.parseRebases(view, header.dyldInfo);
    this.binds = this.parseBinds(view, header.dyldInfo);
    this.validateSegments();
  }

  static open(name: string, input: Uint8Array): MachImage {
    return new MachImage(name, amd64Slice(input));
  }

  export(name: string, loadBase: number): number {
    const address = this.symbols.get(name);
    if (address === undefined) {
      throw new Error(`find ${name} in ${this.name}: symbol not found`);
    }
    if (address < this.base) {
      throw new Error(
        `symbol ${name} in ${this.name} precedes image base`,
      );
    }
    return loadBase + (address - this.base);
  }

  relocate(
    loadBase: number,
    resolve: (name: string) => number,
  ): void {
    if (this.relocated) {
      throw new Error(`${this.name} is already relocated`);
    }

    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset,
      this.data.byteLength,
    );

    for (const relocation of this.rebases) {
      if (relocation.type !== REBASE_TYPE_POINTER) {
        throw new Error(
          `${this.name} uses unsupported rebase type ${relocation.type}`,
        );
      }
      if (relocation.value < this.base) {
        throw new Error(
          `${this.name} contains a rebase below its image base`,
        );
      }
      const offset = this.segmentFileOffsetOrBss(
        relocation.segment,
        relocation.offset,
        POINTER_SIZE,
      );
      if (offset < 0) {
        continue;
      }
      const address = loadBase + (relocation.value - this.base);
      this.putPointer(view, offset, address);
    }

    for (const binding of this.binds) {
      // Lazy bind streams may omit SET_TYPE; dyld's default is a pointer bind.
      if (binding.type !== 0 && binding.type !== BIND_TYPE_POINTER) {
        throw new Error(
          `${this.name} uses unsupported bind type ${binding.type} for ${binding.name}`,
        );
      }
      const offset = this.segmentFileOffsetOrBss(
        binding.segment,
        binding.segOffset,
        POINTER_SIZE,
      );
      if (offset < 0) {
        continue;
      }
      const resolved = resolve(binding.name);
      this.putPointer(view, offset, resolved + binding.addend);
    }

    this.relocated = true;
    this.loadedBase = loadBase;
  }

  /** Test-only: the relocated image payload (diffing hook). */
  debugBytes(): Uint8Array {
    return this.data.slice();
  }

  load(memory: GuestMemory): void {
    if (!this.relocated) {
      throw new Error(`${this.name} must be relocated before loading`);
    }

    let span = 0;
    for (const segment of this.segments) {
      if (segment.name === "__PAGEZERO" || segment.size === 0) {
        continue;
      }
      if (segment.address < this.base) {
        throw new Error(
          `segment ${segment.name} in ${this.name} precedes image base`,
        );
      }
      const end = segment.address - this.base + segment.size;
      if (end > MAX_IMAGE_SPAN) {
        throw new Error(
          `segment ${segment.name} makes ${this.name} too large`,
        );
      }
      span = Math.max(span, end);
    }

    span = align(span, PAGE_SIZE);
    if (span === 0) {
      throw new Error(`${this.name} has no loadable segments`);
    }

    memory.memMap(this.loadedBase, span);

    for (const segment of this.segments) {
      if (segment.name === "__PAGEZERO" || segment.fileSize === 0) {
        continue;
      }
      if (segment.fileOff + segment.fileSize > this.data.length) {
        throw new Error(
          `segment ${segment.name} data exceeds ${this.name}`,
        );
      }
      const address = this.loadedBase + (segment.address - this.base);
      memory.memWrite(
        address,
        this.data.subarray(
          segment.fileOff,
          segment.fileOff + segment.fileSize,
        ),
      );
    }
  }

  private parseHeader(view: DataView) {
    const cputype = view.getInt32(4, true);
    const ncmds = view.getUint32(16, true);

    const segments: Segment[] = [];
    let symtab: { symoff: number; nsyms: number; stroff: number; strsize: number } | null = null;
    let dyldInfo: {
      rebaseOff: number;
      rebaseSize: number;
      bindOff: number;
      bindSize: number;
      weakOff: number;
      weakSize: number;
      lazyOff: number;
      lazySize: number;
    } | null = null;

    let offset = 32;
    for (let index = 0; index < ncmds; index++) {
      if (offset + 8 > view.byteLength) {
        throw new Error(`load command ${index} exceeds ${this.name}`);
      }
      const cmd = view.getUint32(offset, true);
      const cmdsize = view.getUint32(offset + 4, true);
      if (cmdsize < 8 || offset + cmdsize > view.byteLength) {
        throw new Error(`load command ${index} is malformed in ${this.name}`);
      }

      if (cmd === LC_SEGMENT_64) {
        const name = readCString(new DataView(view.buffer, view.byteOffset + offset + 8, 16), 0);
        segments.push({
          name,
          address: Number(view.getBigUint64(offset + 24, true)),
          size: Number(view.getBigUint64(offset + 32, true)),
          fileOff: Number(view.getBigUint64(offset + 40, true)),
          fileSize: Number(view.getBigUint64(offset + 48, true)),
        });
      } else if (cmd === LC_SYMTAB) {
        symtab = {
          symoff: view.getUint32(offset + 8, true),
          nsyms: view.getUint32(offset + 12, true),
          stroff: view.getUint32(offset + 16, true),
          strsize: view.getUint32(offset + 20, true),
        };
      } else if (cmd === LC_DYLD_INFO || cmd === LC_DYLD_INFO_ONLY) {
        dyldInfo = {
          rebaseOff: view.getUint32(offset + 8, true),
          rebaseSize: view.getUint32(offset + 12, true),
          bindOff: view.getUint32(offset + 16, true),
          bindSize: view.getUint32(offset + 20, true),
          weakOff: view.getUint32(offset + 24, true),
          weakSize: view.getUint32(offset + 28, true),
          lazyOff: view.getUint32(offset + 32, true),
          lazySize: view.getUint32(offset + 36, true),
        };
      }

      offset += cmdsize;
    }

    if (cputype !== CPU_TYPE_X86_64) {
      throw new Error(
        `open ${this.name}: expected x86-64 Mach-O, found cputype ${cputype}`,
      );
    }

    const loadable = segments.filter((s) => s.name !== "__PAGEZERO" && s.size > 0);
    if (loadable.length === 0) {
      throw new Error(`open ${this.name}: no loadable segments`);
    }
    const base = loadable.reduce(
      (minimum, segment) => Math.min(minimum, segment.address),
      Infinity,
    );

    return { base, segments, symtab, dyldInfo };
  }

  private parseSymtab(
    view: DataView,
    symtab: { symoff: number; nsyms: number; stroff: number; strsize: number } | null,
  ): void {
    if (!symtab) {
      return;
    }
    const { symoff, nsyms, stroff, strsize } = symtab;
    if (symoff + nsyms * 16 > view.byteLength) {
      throw new Error(`symbol table exceeds ${this.name}`);
    }
    if (stroff + strsize > view.byteLength) {
      throw new Error(`string table exceeds ${this.name}`);
    }

    const strings = new DataView(view.buffer, view.byteOffset + stroff, strsize);
    for (let index = 0; index < nsyms; index++) {
      const entry = symoff + index * 16;
      const strx = view.getUint32(entry, true);
      const nType = view.getUint8(entry + 4);
      const value = Number(view.getBigUint64(entry + 8, true));
      if (value === 0 || (nType & 0x0e) === 0) {
        continue;
      }
      if (strx >= strsize) {
        continue;
      }
      const name = readCString(strings, strx);
      if (!name || this.symbols.has(name)) {
        continue;
      }
      this.symbols.set(name, value);
    }
  }

  private parseRebases(
    view: DataView,
    info: {
      rebaseOff: number;
      rebaseSize: number;
      bindOff: number;
      bindSize: number;
      weakOff: number;
      weakSize: number;
      lazyOff: number;
      lazySize: number;
    } | null,
  ): MachRebase[] {
    if (!info || info.rebaseSize === 0) {
      return [];
    }

    const reader = new UlebReader(view, info.rebaseOff, info.rebaseOff + info.rebaseSize);
    const rebases: MachRebase[] = [];

    let type = 0;
    let segment: Segment | null = null;
    // Offsets move in uint64 space (negative ADD_ADDR_ULEB deltas are legal).
    let offset = 0n;

    const readOriginalPointer = (): number => {
      // The pre-rebase pointer value lives in the image itself; rebasing
      // computes slide + original (go-macho/dyld semantics).
      const fileOffset = this.requireCurrentSegmentFileOffset(
        segment,
        Number(offset),
      );
      return Number(view.getBigUint64(fileOffset, true));
    };

    const rebaseOnce = () => {
      rebases.push({
        segment: segment!.name,
        offset: Number(offset),
        type,
        value: readOriginalPointer(),
      });
    };

    while (reader.remaining > 0) {
      const opcode = reader.readByte();
      const immediate = opcode & 0x0f;
      const action = opcode & 0xf0;

      switch (action) {
        case 0x00: // DONE
          return rebases;
        case 0x10: // SET_TYPE_IMM
          type = immediate;
          break;
        case 0x20: {
          // SET_SEGMENT_AND_OFFSET_ULEB
          segment = this.requireSegment(immediate);
          offset = reader.readUlebBig();
          break;
        }
        case 0x30: // ADD_ADDR_ULEB
          offset = BigInt.asUintN(64, offset + reader.readUlebBig());
          break;
        case 0x40: // ADD_ADDR_IMM_SCALED
          offset = BigInt.asUintN(64, offset + BigInt(immediate * POINTER_SIZE));
          break;
        case 0x50: {
          // DO_REBASE_IMM_TIMES
          for (let index = 0; index < immediate; index++) {
            rebaseOnce();
            offset = BigInt.asUintN(64, offset + BigInt(POINTER_SIZE));
          }
          break;
        }
        case 0x60: {
          // DO_REBASE_ULEB_TIMES
          const count = reader.readUleb();
          for (let index = 0; index < count; index++) {
            rebaseOnce();
            offset = BigInt.asUintN(64, offset + BigInt(POINTER_SIZE));
          }
          break;
        }
        case 0x70: {
          // DO_REBASE_ADD_ADDR_ULEB
          rebaseOnce();
          offset = BigInt.asUintN(
            64,
            offset + reader.readUlebBig() + BigInt(POINTER_SIZE),
          );
          break;
        }
        case 0x80: {
          // DO_REBASE_ULEB_TIMES_SKIPPING_ULEB (skip is in bytes)
          const count = reader.readUleb();
          const skip = reader.readUleb();
          for (let index = 0; index < count; index++) {
            rebaseOnce();
            offset = BigInt.asUintN(64, offset + BigInt(skip + POINTER_SIZE));
          }
          break;
        }
        default:
          throw new Error(`unsupported rebase opcode ${opcode.toString(16)}`);
      }
    }

    return rebases;
  }

  private parseBinds(
    view: DataView,
    info: {
      rebaseOff: number;
      rebaseSize: number;
      bindOff: number;
      bindSize: number;
      weakOff: number;
      weakSize: number;
      lazyOff: number;
      lazySize: number;
    } | null,
  ): MachBind[] {
    if (!info) {
      return [];
    }

    const binds: MachBind[] = [];
    this.parseBindStream(view, info.bindOff, info.bindOff + info.bindSize, binds);
    this.parseBindStream(view, info.weakOff, info.weakOff + info.weakSize, binds);
    this.parseBindStream(
      view,
      info.lazyOff,
      info.lazyOff + info.lazySize,
      binds,
      true,
    );

    return binds;
  }

  private parseBindStream(
    view: DataView,
    start: number,
    end: number,
    binds: MachBind[],
    isLazy = false,
  ): void {
    const reader = new UlebReader(view, start, end);

    let type = 0;
    let addend = 0;
    let symbolName = "";
    let segment: Segment | null = null;
    // Segment offsets move in uint64 space: ADD_ADDR_ULEB deltas are 64-bit
    // encodings of negative steps, so all arithmetic stays in BigInt.
    let segOffset = 0n;

    const bind = () => {
      this.requireCurrentSegment(segment);
      binds.push({
        segment: segment!.name,
        segOffset: Number(segOffset),
        name: symbolName,
        type,
        addend,
      });
    };

    while (reader.remaining > 0) {
      const opcode = reader.readByte();
      const immediate = opcode & 0xf;
      const action = opcode & 0xf0;
      switch (action) {
        case 0x00: // DONE
          if (opcode === 0x00) {
            if (!isLazy) {
              return;
            }
            // Lazy streams terminate each entry with DONE and continue with
            // the next; reset the per-entry state (go-macho/dyld semantics).
            type = 0;
            addend = 0;
            symbolName = "";
            segment = null;
            segOffset = 0n;
            break;
          }
          break;
        case 0x10: // SET_DYLIB_ORDINAL_IMM (ordinal unused: resolve by name)
          break;
        case 0x20: // SET_DYLIB_ORDINAL_ULEB
          reader.readUleb();
          break;
        case 0x30: // SET_DYLIB_SPECIAL_IMM
          break;
        case 0x40: // SET_SYMBOL_TRAILING_FLAGS_IMM
          symbolName = reader.readCString();
          break;
        case 0x50: // SET_TYPE_IMM
          type = immediate;
          break;
        case 0x60: // SET_ADDEND_SLEB
          addend = reader.readSleb();
          break;
        case 0x70: {
          // SET_SEGMENT_AND_OFFSET_ULEB
          segment = this.requireSegment(immediate);
          segOffset = reader.readUlebBig();
          break;
        }
        case 0x80: // ADD_ADDR_ULEB
          segOffset = BigInt.asUintN(64, segOffset + reader.readUlebBig());
          break;
        // NOTE: the bind opcode table has no ADD_ADDR_IMM_SCALED (that is a
        // rebase-only opcode), so DO_BIND sits at 0x90, one slot below rebase.
        case 0x90: // DO_BIND
          bind();
          segOffset = BigInt.asUintN(64, segOffset + BigInt(POINTER_SIZE));
          break;
        case 0xa0: // DO_BIND_ADD_ADDR_ULEB
          bind();
          segOffset = BigInt.asUintN(
            64,
            segOffset + reader.readUlebBig() + BigInt(POINTER_SIZE),
          );
          break;
        case 0xb0: // DO_BIND_ADD_ADDR_IMM_SCALED
          bind();
          segOffset = BigInt.asUintN(
            64,
            segOffset + BigInt(immediate * POINTER_SIZE + POINTER_SIZE),
          );
          break;
        case 0xc0: {
          // DO_BIND_ULEB_TIMES_SKIPPING_ULEB
          const count = reader.readUleb();
          const skip = reader.readUleb();
          for (let index = 0; index < count; index++) {
            bind();
            segOffset = BigInt.asUintN(
              64,
              segOffset + BigInt(skip + POINTER_SIZE),
            );
          }
          break;
        }
        case 0xd0: // BIND_OPCODE_THREADED (not present in 10.9-era images)
          throw new Error(
            `threaded bind opcodes are unsupported in ${this.name} (pos=0x${reader.position.toString(16)}, stream=[0x${start.toString(16)},0x${end.toString(16)}], segOffset=${segOffset}, symbol=${symbolName})`,
          );
        default:
          throw new Error(`unsupported bind opcode ${opcode.toString(16)}`);
      }
    }
  }

  private requireSegment(index: number): Segment {
    const segment = this.segments[index];
    if (!segment) {
      throw new Error(`fixup references unknown segment index ${index} in ${this.name}`);
    }
    return segment;
  }

  private requireCurrentSegment(segment: Segment | null): void {
    if (!segment) {
      throw new Error(`fixup in ${this.name} has no segment selected`);
    }
  }

  private requireCurrentSegmentFileOffset(
    segment: Segment | null,
    offset: number,
  ): number {
    this.requireCurrentSegment(segment);
    return this.segmentFileOffset(segment!.name, offset, POINTER_SIZE);
  }

  private validateSegments(): void {
    for (const segment of this.segments) {
      if (segment.fileSize > segment.size) {
        throw new Error(
          `segment ${segment.name} file data exceeds its memory size in ${this.name}`,
        );
      }
      if (segment.fileOff + segment.fileSize > this.data.length) {
        throw new Error(`segment ${segment.name} data exceeds ${this.name}`);
      }
    }
  }

  private segmentFileOffset(name: string, offset: number, size: number): number {
    const result = this.segmentFileOffsetOrBss(name, offset, size);
    if (result < 0) {
      throw new Error(
        `fixup at ${offset.toString(16)} lands in the BSS area of segment ${name} in ${this.name}`,
      );
    }
    return result;
  }

  /**
   * File offset for a fixup, or -1 when it targets the segment's BSS tail
   * (within vmsize but past fileSize). dyld applies such fixups to the
   * zero-filled memory at load time; for our purposes the loaded image is
   * equally zero there, so callers skip them.
   */
  private segmentFileOffsetOrBss(
    name: string,
    offset: number,
    size: number,
  ): number {
    for (const segment of this.segments) {
      if (segment.name !== name) {
        continue;
      }
      if (offset + size > segment.size) {
        throw new Error(
          `fixup at ${offset.toString(16)} exceeds segment ${name} in ${this.name}`,
        );
      }
      if (offset + size > segment.fileSize) {
        return -1;
      }
      const result = segment.fileOff + offset;
      if (result + size > this.data.length) {
        throw new Error(`fixup at ${result.toString(16)} exceeds ${this.name}`);
      }
      return result;
    }
    throw new Error(`fixup references unknown segment ${name} in ${this.name}`);
  }

  private putPointer(view: DataView, offset: number, value: number): void {
    if (offset + 8 > view.byteLength) {
      throw new Error(`fixup at ${offset.toString(16)} exceeds ${this.name}`);
    }
    view.setUint32(offset, value % 4294967296, true);
    view.setUint32(offset + 4, Math.floor(value / 4294967296), true);
  }
}



function amd64Slice(input: Uint8Array): Uint8Array {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (input.length < 4) {
    throw new Error("Mach-O input is too small");
  }

  const magic = view.getUint32(0, false);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) {
    return input;
  }

  const wide = magic === FAT_MAGIC_64;
  const count = view.getUint32(4, false);
  const entrySize = wide ? 32 : 20;
  if (4 + 8 + count * entrySize > view.byteLength) {
    throw new Error("fat header exceeds input size");
  }

  for (let index = 0; index < count; index++) {
    const entry = 8 + index * entrySize;
    const cputype = view.getInt32(entry, false);
    if (cputype !== CPU_TYPE_X86_64) {
      continue;
    }
    // fat_arch(32): cputype, cpusubtype, offset, size, align (5 x u32).
    // fat_arch_64: cputype, cpusubtype, offset(u64), size(u64), align, reserved.
    const offset = wide
      ? Number(view.getBigUint64(entry + 8, false))
      : view.getUint32(entry + 8, false);
    const size = wide
      ? Number(view.getBigUint64(entry + 16, false))
      : view.getUint32(entry + 12, false);
    if (offset + size > input.length) {
      throw new Error("x86-64 slice exceeds input size");
    }
    return input.subarray(offset, offset + size);
  }

  throw new Error("universal binary has no x86-64 slice");
}
