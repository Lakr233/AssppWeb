// x86-64 instruction length decoder.
//
// unicorn.js traps on any basic block longer than about ninety instructions,
// so the machine splits long blocks by planting a temporary HLT at a safe
// point ahead of the guest and continuing from there. That needs instruction
// boundaries, and the guest images are obfuscated badly enough that objdump's
// linear sweep desyncs and reports valid instructions as bad opcodes.
//
// Only lengths are needed, never semantics, so this decodes the encoding
// structure — prefixes, REX, opcode, ModRM, SIB, displacement, immediate —
// and does not care what any instruction does. It also reports whether an
// instruction ends a basic block, since the emulator will end one there
// anyway and there is no point planting a HLT past it.

const enum Imm {
  None = 0,
  Byte = 1,
  Word = 2,
  /** 4 bytes, or 2 with an operand-size prefix. */
  Zed = 3,
  /** 4 bytes, or 8 for a REX.W MOV. */
  Vee = 4,
}

/** Opcodes taking a ModRM byte, one bit per opcode. */
const ONE_BYTE_MODRM = new Uint8Array(256);
for (const range of [
  [0x00, 0x03], [0x08, 0x0b], [0x10, 0x13], [0x18, 0x1b],
  [0x20, 0x23], [0x28, 0x2b], [0x30, 0x33], [0x38, 0x3b],
  [0x62, 0x63], [0x69, 0x69], [0x6b, 0x6b], [0x80, 0x8f],
  [0xc0, 0xc1], [0xc4, 0xc7], [0xd0, 0xd3], [0xd8, 0xdf],
  [0xf6, 0xf7], [0xfe, 0xff],
]) {
  for (let code = range[0]; code <= range[1]; code++) ONE_BYTE_MODRM[code] = 1;
}

const ONE_BYTE_IMMEDIATE = new Uint8Array(256);
function setImmediate(from: number, to: number, kind: Imm) {
  for (let code = from; code <= to; code++) ONE_BYTE_IMMEDIATE[code] = kind;
}
for (const base of [0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]) {
  setImmediate(base + 4, base + 4, Imm.Byte); // AL, imm8
  setImmediate(base + 5, base + 5, Imm.Zed); // eAX, imm
}
setImmediate(0x68, 0x68, Imm.Zed);
setImmediate(0x69, 0x69, Imm.Zed);
setImmediate(0x6a, 0x6a, Imm.Byte);
setImmediate(0x6b, 0x6b, Imm.Byte);
setImmediate(0x70, 0x7f, Imm.Byte); // Jcc rel8
setImmediate(0x80, 0x80, Imm.Byte);
setImmediate(0x81, 0x81, Imm.Zed);
setImmediate(0x83, 0x83, Imm.Byte);
setImmediate(0xa8, 0xa8, Imm.Byte);
setImmediate(0xa9, 0xa9, Imm.Zed);
setImmediate(0xb0, 0xb7, Imm.Byte); // MOV r8, imm8
setImmediate(0xb8, 0xbf, Imm.Vee); // MOV r, imm
setImmediate(0xc0, 0xc1, Imm.Byte);
setImmediate(0xc2, 0xc2, Imm.Word);
setImmediate(0xc6, 0xc6, Imm.Byte);
setImmediate(0xc7, 0xc7, Imm.Zed);
setImmediate(0xc8, 0xc8, Imm.Word); // ENTER takes imm16 then imm8
setImmediate(0xcd, 0xcd, Imm.Byte);
setImmediate(0xe8, 0xe9, Imm.Zed); // CALL/JMP rel32
setImmediate(0xe0, 0xe7, Imm.Byte);
setImmediate(0xeb, 0xeb, Imm.Byte);

/** Two-byte (0x0F) opcodes that take no ModRM byte. */
const TWO_BYTE_NO_MODRM = new Set([
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0b, 0x0e, 0x30, 0x31, 0x32, 0x33, 0x34,
  0x35, 0x37, 0x77, 0xa0, 0xa1, 0xa2, 0xa8, 0xa9, 0xaa, 0xc8, 0xc9, 0xca,
  0xcb, 0xcc, 0xcd, 0xce, 0xcf,
]);

export interface Decoded {
  length: number;
  /** True for branches, calls, returns and interrupts. */
  endsBlock: boolean;
  /**
   * For a direct relative branch, its displacement from the end of the
   * instruction. Absent for indirect branches and returns, whose target only
   * exists at run time.
   */
  relative?: number;
  /**
   * For an indirect branch through memory, how to compute the address its
   * target pointer sits at. Register numbers are already REX-extended.
   */
  indirect?: {
    base: number | null;
    index: number | null;
    scale: number;
    displacement: number;
    /** True when the address is relative to the end of the instruction. */
    ripRelative: boolean;
    /** True for `call rax` style, where the register holds the target. */
    register: number | null;
  };
}

/**
 * Decodes the instruction at `offset`, returning its length in bytes.
 * Throws when the encoding is not recognised, which the caller should treat
 * as "stop scanning" rather than as a fatal error.
 */
export function decode(code: Uint8Array, offset: number): Decoded {
  let cursor = offset;
  let operandSize = false;
  let addressSize = false;
  let rexW = false;
  let rexB = false;
  let rexX = false;

  // Legacy prefixes, then REX. Anything else ends the prefix run.
  for (;;) {
    const byte = code[cursor];
    if (byte === undefined) throw new Error("instruction runs past the buffer");

    if (byte === 0x66) {
      operandSize = true;
    } else if (byte === 0x67) {
      addressSize = true;
    } else if (
      byte === 0xf0 || byte === 0xf2 || byte === 0xf3 ||
      byte === 0x2e || byte === 0x36 || byte === 0x3e ||
      byte === 0x26 || byte === 0x64 || byte === 0x65
    ) {
      // lock, rep, segment overrides: no effect on length
    } else if (byte >= 0x40 && byte <= 0x4f) {
      rexW = (byte & 0x08) !== 0;
      rexX = (byte & 0x02) !== 0;
      rexB = (byte & 0x01) !== 0;
      cursor++;
      break; // REX must be the last prefix
    } else {
      break;
    }
    cursor++;
  }

  let opcode = code[cursor++];
  let indirect: Decoded["indirect"];
  let hasModRM: boolean;
  let immediate: Imm = Imm.None;
  let endsBlock = false;

  if (opcode === 0x0f) {
    const second = code[cursor++];

    if (second === 0x38 || second === 0x3a) {
      // Three-byte opcodes: always ModRM, 0x3a adds an imm8.
      cursor++;
      hasModRM = true;
      if (second === 0x3a) immediate = Imm.Byte;
    } else {
      hasModRM = !TWO_BYTE_NO_MODRM.has(second);

      if (second >= 0x80 && second <= 0x8f) {
        // Jcc rel32 carries no ModRM; counting one shifts every later
        // boundary by a byte.
        hasModRM = false;
        immediate = Imm.Zed;
        endsBlock = true;
      } else if (
        // pshuf* and the SSE compares
        second === 0x70 || second === 0xc2 || second === 0xc4 ||
        second === 0xc5 || second === 0xc6 ||
        // shift groups 12 to 14, taking a count byte
        second === 0x71 || second === 0x72 || second === 0x73 ||
        // bit test group 8
        second === 0xba ||
        // SHLD and SHRD by an immediate; the guest's obfuscation is full of
        // these and a missed byte here shifts every later boundary
        second === 0xa4 || second === 0xac
      ) {
        immediate = Imm.Byte;
      } else if (second === 0x05 || second === 0x0b) {
        endsBlock = true; // SYSCALL, UD2
      }
    }
    opcode = -1;
  } else {
    hasModRM = ONE_BYTE_MODRM[opcode] === 1;
    immediate = ONE_BYTE_IMMEDIATE[opcode] as Imm;

    endsBlock =
      (opcode >= 0x70 && opcode <= 0x7f) || // Jcc rel8
      opcode === 0xc2 || opcode === 0xc3 || // RET
      opcode === 0xca || opcode === 0xcb ||
      opcode === 0xcc || opcode === 0xcd || opcode === 0xce || // INT
      opcode === 0xcf || // IRET
      (opcode >= 0xe0 && opcode <= 0xe3) || // LOOP/JCXZ
      opcode === 0xe8 || opcode === 0xe9 || opcode === 0xeb || // CALL/JMP
      opcode === 0xf1 || opcode === 0xf4; // INT1, HLT
  }

  if (hasModRM) {
    const modrm = code[cursor++];
    if (modrm === undefined) throw new Error("ModRM runs past the buffer");

    const mod = modrm >> 6;
    const rm = modrm & 0x07;

    let sibByte: number | null = null;
    let displacement = 0;
    let displacementAt = -1;

    if (mod !== 3) {
      if (addressSize) {
        // 16-bit addressing: only mod 0 with rm 6 carries a displacement.
        if (mod === 1) cursor += 1;
        else if (mod === 2 || (mod === 0 && rm === 6)) cursor += 2;
      } else {
        if (rm === 4) {
          sibByte = code[cursor++];
          if (sibByte === undefined) throw new Error("SIB runs past the buffer");
          // A base of 5 with mod 0 means a 32-bit displacement instead.
          if (mod === 0 && (sibByte & 0x07) === 5) {
            displacementAt = cursor;
            cursor += 4;
          }
        }
        if (mod === 1) {
          displacementAt = cursor;
          cursor += 1;
        } else if (mod === 2) {
          displacementAt = cursor;
          cursor += 4;
        } else if (mod === 0 && rm === 5) {
          displacementAt = cursor; // RIP-relative
          cursor += 4;
        }
      }
    }

    // FF /2 and /3 are indirect CALL, /4 and /5 indirect JMP.
    if (opcode === 0xff) {
      const reg = (modrm >> 3) & 0x07;
      if (reg >= 2 && reg <= 5) {
        endsBlock = true;

        const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
        if (displacementAt >= 0) {
          displacement =
            mod === 1 ? view.getInt8(displacementAt) : view.getInt32(displacementAt, true);
        }

        if (mod === 3) {
          indirect = {
            base: null, index: null, scale: 1, displacement: 0,
            ripRelative: false, register: rm | (rexB ? 8 : 0),
          };
        } else if (sibByte !== null) {
          const scale = 1 << (sibByte >> 6);
          const indexReg = ((sibByte >> 3) & 0x07) | (rexX ? 8 : 0);
          const baseReg = (sibByte & 0x07) | (rexB ? 8 : 0);
          indirect = {
            // Index 4 without REX.X encodes "no index".
            index: indexReg === 4 ? null : indexReg,
            base: mod === 0 && (sibByte & 0x07) === 5 ? null : baseReg,
            scale, displacement, ripRelative: false, register: null,
          };
        } else {
          indirect = {
            base: mod === 0 && rm === 5 ? null : rm | (rexB ? 8 : 0),
            index: null, scale: 1, displacement,
            ripRelative: mod === 0 && rm === 5,
            register: null,
          };
        }
      }
    }

    // Group 3: TEST under F6/F7 carries an immediate, the rest do not.
    if (opcode === 0xf6 || opcode === 0xf7) {
      const reg = (modrm >> 3) & 0x07;
      immediate = reg <= 1 ? (opcode === 0xf6 ? Imm.Byte : Imm.Zed) : Imm.None;
    }
  }

  switch (immediate) {
    case Imm.Byte:
      cursor += 1;
      break;
    case Imm.Word:
      cursor += 2;
      break;
    case Imm.Zed:
      cursor += operandSize ? 2 : 4;
      break;
    case Imm.Vee:
      cursor += rexW ? 8 : operandSize ? 2 : 4;
      break;
    default:
      break;
  }

  if (opcode === 0xc8) cursor += 1; // ENTER's trailing imm8

  const length = cursor - offset;
  if (length <= 0 || length > 15) {
    throw new Error(`implausible instruction length ${length}`);
  }

  return {
    length,
    endsBlock,
    relative: relativeTarget(code, offset, cursor),
    indirect,
  };
}

/** Displacement of a direct relative branch, measured from its end. */
function relativeTarget(
  code: Uint8Array,
  offset: number,
  end: number,
): number | undefined {
  const first = code[offset];

  // Skip prefixes to find the opcode; only REX matters for these encodings.
  let cursor = offset;
  while (
    code[cursor] === 0x66 || code[cursor] === 0x67 || code[cursor] === 0xf0 ||
    code[cursor] === 0xf2 || code[cursor] === 0xf3 ||
    (code[cursor] >= 0x40 && code[cursor] <= 0x4f)
  ) {
    cursor++;
  }

  const opcode = code[cursor];
  const view = new DataView(code.buffer, code.byteOffset, code.byteLength);

  if (opcode === 0xeb || (opcode >= 0x70 && opcode <= 0x7f)) {
    return view.getInt8(cursor + 1);
  }

  if (opcode === 0xe8 || opcode === 0xe9) {
    return view.getInt32(cursor + 1, true);
  }

  if (opcode === 0x0f && code[cursor + 1] >= 0x80 && code[cursor + 1] <= 0x8f) {
    return view.getInt32(cursor + 2, true);
  }

  void first;
  void end;
  return undefined;
}

export interface Block {
  /** Instructions up to and including the terminator, or up to `limit`. */
  instructions: number;
  /** Byte offset one past the last instruction counted. */
  end: number;
  /** False when the scan stopped at `limit` rather than at a terminator. */
  complete: boolean;
  /** The terminator and where it starts, when the block ended on its own. */
  terminator?: { offset: number; decoded: Decoded };
}

/**
 * Measures the basic block starting at `offset`, stopping at `limit`
 * instructions if it has not ended by then.
 */
export function measureBlock(
  code: Uint8Array,
  offset: number,
  limit: number,
): Block {
  let cursor = offset;

  for (let index = 0; index < limit; index++) {
    const start = cursor;
    const decoded = decode(code, cursor);
    cursor += decoded.length;

    if (decoded.endsBlock) {
      return {
        instructions: index + 1,
        end: cursor,
        complete: true,
        terminator: { offset: start, decoded },
      };
    }
  }

  return { instructions: limit, end: cursor, complete: false };
}
