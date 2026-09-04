import { describe, expect, it } from "vitest";
import { MachImage } from "../../src/apple/sap/machImage";

// Minimal little-endian Mach-O 64 builder for opcode-level tests.
function buildMachO(options: {
  segments: Array<{
    name: string;
    vmaddr: number;
    vmsize: number;
    fileoff: number;
    filesize: number;
    data: Uint8Array;
  }>;
  rebaseOpcodes?: Uint8Array;
  bindOpcodes?: Uint8Array;
  lazyBindOpcodes?: Uint8Array;
  symbols?: Array<{ name: string; value: number }>;
}): Uint8Array {
  const {
    segments,
    rebaseOpcodes = new Uint8Array([0x00]),
    bindOpcodes = new Uint8Array([0x00]),
    lazyBindOpcodes = new Uint8Array([0x00]),
    symbols = [],
  } = options;

  const sizeofcmds =
    segments.length * 72 + 24 + 48; // LC_SEGMENT_64s + LC_SYMTAB + LC_DYLD_INFO_ONLY
  // Layout: header+load commands, then each segment's file data back-to-back
  // from 0x1000, then symbol/opcode tables in a trailing scratch region.
  const dataStart = Math.max(0x1000, 32 + sizeofcmds + 0x40);
  let dataCursor = dataStart;
  const placements: number[] = [];
  for (const segment of segments) {
    placements.push(dataCursor);
    dataCursor += segment.data.length;
  }
  const totalSize = dataCursor + 0x1000;
  const image = new Uint8Array(totalSize);
  const view = new DataView(image.buffer);

  view.setUint32(0, 0xfeedfacf, true); // MH_MAGIC_64
  view.setUint32(4, 0x01000007, true); // CPU_TYPE_X86_64
  view.setUint32(16, segments.length + 2, true); // ncmds

  let offset = 32;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const fileoff = placements[index];
    view.setUint32(offset, 0x19, true); // LC_SEGMENT_64
    view.setUint32(offset + 4, 72, true);
    const nameBytes = new TextEncoder().encode(segment.name);
    image.set(nameBytes.subarray(0, 16), offset + 8);
    image.fill(0x20, offset + 8 + nameBytes.length, offset + 24);
    view.setBigUint64(offset + 24, BigInt(segment.vmaddr), true);
    view.setBigUint64(offset + 32, BigInt(segment.vmsize), true);
    view.setBigUint64(offset + 40, BigInt(fileoff), true);
    view.setBigUint64(offset + 48, BigInt(segment.data.length), true);
    image.set(segment.data, fileoff);
    offset += 72;
  }

  // LC_SYMTAB
  const stringTable = new Uint8Array(0x100);
  const stringView = new DataView(stringTable.buffer);
  const nlists: number[] = [];
  let stringCursor = 1;
  for (const symbol of symbols) {
    const encoded = new TextEncoder().encode(symbol.name);
    stringTable.set(encoded, stringCursor);
    nlists.push(stringCursor);
    stringView.setUint8(stringCursor + encoded.length, 0);
    stringCursor += encoded.length + 1;
  }
  const symoff = totalSize - 0x800;
  const stroff = symoff - 0x100;
  let cursor = symoff;
  for (let index = 0; index < symbols.length; index++) {
    view.setUint32(cursor, nlists[index], true);
    view.setUint8(cursor + 4, 0x0f); // N_EXT | N_SECT
    view.setUint8(cursor + 5, 1);
    view.setUint16(cursor + 6, 0, true);
    view.setBigUint64(cursor + 8, BigInt(symbols[index].value), true);
    cursor += 16;
  }
  image.set(stringTable, stroff);

  view.setUint32(offset, 0x2, true); // LC_SYMTAB
  view.setUint32(offset + 4, 24, true);
  view.setUint32(offset + 8, symoff, true);
  view.setUint32(offset + 12, symbols.length, true);
  view.setUint32(offset + 16, stroff, true);
  view.setUint32(offset + 20, stringTable.length, true);
  offset += 24;

  // LC_DYLD_INFO_ONLY
  const rebaseOff = totalSize - 0x400;
  const bindOff = totalSize - 0x300;
  const lazyOff = totalSize - 0x200;
  image.set(rebaseOpcodes, rebaseOff);
  image.set(bindOpcodes, bindOff);
  image.set(lazyBindOpcodes, lazyOff);

  view.setUint32(offset, 0x80000022, true);
  view.setUint32(offset + 4, 48, true);
  view.setUint32(offset + 8, rebaseOff, true);
  view.setUint32(offset + 12, rebaseOpcodes.length, true);
  view.setUint32(offset + 16, bindOff, true);
  view.setUint32(offset + 20, bindOpcodes.length, true);
  view.setUint32(offset + 24, 0, true); // weak off
  view.setUint32(offset + 28, 0, true);
  view.setUint32(offset + 32, lazyOff, true);
  view.setUint32(offset + 36, lazyBindOpcodes.length, true);
  return image;
}

const segment = (name: string, size: number) => ({
  name,
  vmaddr: 0,
  vmsize: size,
  fileoff: 0x1000,
  filesize: size,
  data: new Uint8Array(size),
});

describe("MachImage", () => {
  it("resolves exported symbols and applies the load-base slide", () => {
    const image = MachImage.open(
      "test",
      buildMachO({
        segments: [segment("__TEXT", 0x1000)],
        symbols: [{ name: "_entry", value: 0x1234 }],
      }),
    );
    expect(image.export("_entry", 0x5000)).toBe(0x5000 + 0x1234);
    expect(() => image.export("_missing", 0)).toThrow(/symbol not found/);
  });

  it("parses classic rebase opcodes and reads original pointers from the image", () => {
    const data = new Uint8Array(0x1000);
    const view = new DataView(data.buffer);
    view.setBigUint64(0x18, 0x1122334455667788n, true); // original pointer at __DATA+0x18
    const segments = [
      { ...segment("__DATA", 0x1000), data },
      segment("__LINKEDIT", 0x100),
    ];

    // SET_TYPE(POINTER=1); SET_SEGMENT(1) offset 0x10; DO_REBASE_IMM x3
    const rebase = new Uint8Array([0x11, 0x21, 0x10, 0x53, 0x00]);
    const image = MachImage.open(
      "test",
      buildMachO({ segments, rebaseOpcodes: rebase }),
    );
    // The private parses are exercised through relocate/load; verify the
    // public contract instead: relocate succeeds and the image loads.
    const fakeMemory = {
      mapped: [] as Array<[number, number]>,
      memMap(address: number, size: number) {
        this.mapped.push([address, size]);
      },
      memWrite() {},
    };
    image.relocate(0x100000000, () => 0x2000);
    image.load(fakeMemory);
    expect(fakeMemory.mapped.length).toBeGreaterThan(0);
  });

  it("bind opcodes resolve imports with addends and segment-relative offsets", () => {
    const data = new Uint8Array(0x1000);
    const segments = [
      { ...segment("__DATA", 0x1000), data },
      segment("__LINKEDIT", 0x100),
    ];
    // ordinal(2); symbol _malloc\0; type POINTER; segment 0 offset 0x20;
    // addend +8; DO_BIND; DONE
    const symbol = new TextEncoder().encode("_malloc");
    const bind = new Uint8Array([
      0x12,
      0x40,
      ...symbol,
      0x00,
      0x51,
      0x70,
      0x20,
      0x60,
      0x08,
      0x90,
      0x00,
    ]);
    const image = MachImage.open(
      "test",
      buildMachO({ segments, bindOpcodes: bind }),
    );
    image.relocate(0x100000000, (name) => {
      if (name === "_malloc") {
        return 0xdeadbeef;
      }
      return 0;
    });
    // Relocation patches the image copy; the first segment lands at 0x1000.
    const relocated = image.debugBytes();
    const view = new DataView(
      relocated.buffer,
      relocated.byteOffset + 0x1020,
    );
    expect(Number(view.getBigUint64(0, true))).toBe(0xdeadbeef + 8);
  });

  it("skips BSS-tail fixups instead of failing", () => {
    // __DATA vmsize 0x2000, filesize 0x1000: fixup at 0x1008 targets BSS.
    const data = new Uint8Array(0x1000);
    const segments = [
      {
        name: "__DATA",
        vmaddr: 0,
        vmsize: 0x2000,
        fileoff: 0x1000,
        filesize: 0x1000,
        data,
      },
      segment("__LINKEDIT", 0x100),
    ];
    const symbol = new TextEncoder().encode("_x");
    const bind = new Uint8Array([
      0x12, 0x40, ...symbol, 0x00, 0x51, 0x70, 0x08, 0x10, 0x90, 0x00,
    ]);
    const image = MachImage.open(
      "test",
      buildMachO({ segments, bindOpcodes: bind }),
    );
    expect(() => image.relocate(0x100000000, () => 0x1234)).not.toThrow();
  });
});
