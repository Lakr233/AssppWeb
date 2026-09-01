// The SAP guest machine.
//
// Ported from ipatool's internal/sap/machine/machine.go. Loads the three
// CommerceKit images into an emulated x86-64 address space, wires the shim
// area underneath them, and exposes the four entry points the SAP protocol
// drives: initialize, exchange, sign and teardown.
//
// The entry points are obfuscated symbol names in the shipped binaries, so
// they are looked up by those names rather than anything descriptive.

import { Engine } from "./engine";
import { type Block, type Decoded, measureBlock } from "./length";
import { MachImage } from "./macho";
import { registerPlatformServices } from "./platform";
import { HEAP_BASE, HEAP_SIZE, Shims, align } from "./shims";

const RETURN_ADDRESS = 0x0000000100000000n;
const CORE_FP_BASE = 0x0000100000000000n;
const COMMERCE_BASE = 0x0000100040000000n;
const KIT_BASE = 0x0000100080000000n;
const SCRATCH_BASE = 0x0000300000000000n;
const SCRATCH_SIZE = 32n << 20n;
const STACK_BASE = 0x0000500000000000n;
const STACK_SIZE = 8n << 20n;
const STACK_END = STACK_BASE + STACK_SIZE;
const PAGE_SIZE = 0x1000n;
const MAX_OUTPUT_SIZE = 16n << 20n;

// ipatool bounds a guest call by both wall clock and instruction count. A
// non-zero timeout makes Unicorn spawn a timer thread, which the WebAssembly
// build cannot do ("qemu_thread_create: Not supported"), so the instruction
// limit is the only bound here. It is the tighter of the two in practice.
const EXECUTION_TIMEOUT_MICROS = 0n;
const INSTRUCTION_LIMIT = 100_000_000;

// unicorn.js aborts inside QEMU's Tiny Code Interpreter on a long basic
// block, so long blocks are executed in pieces: a HLT is planted this far
// ahead of the guest, and execution resumes from there once it stops.
//
// Synthetic blocks of one-byte instructions survive to eighty-eight, but the
// guest's are wider and generate more interpreter operations each, so the
// usable figure is lower. Measured over a full SAP setup: thirty-two works
// and takes 63s, forty-eight works but takes 76s, sixty-four traps.
const MAX_BLOCK_INSTRUCTIONS = 32;

// Enough bytes to decode MAX_BLOCK_INSTRUCTIONS of any encoding.
const CODE_WINDOW = MAX_BLOCK_INSTRUCTIONS * 15;

const CORE_EXPORT_NAMES = [
  "_WIn9UJ86JKdV4dM",
  "_X46O5IeS",
  "_YlCJ3lg",
  "_dku592fbFAj",
  "_fdjkDSAFjklaf2s",
  "_lxpgvVMLd0S7uRl",
];

const ENTRY_NAMES = {
  initialize: "_cp2g1b9ro",
  exchange: "_Mib5yocT",
  sign: "_Fc3vhtJDvr",
  teardown: "_IPaI1oem5iL",
  dispose: "_jEHf8Xzsv8K",
} as const;

export interface AssetBundle {
  commerceKit: Uint8Array;
  commerceCore: Uint8Array;
  coreFP: Uint8Array;
  coreFPICXS: Uint8Array;
}

interface EntryPoints {
  initialize: bigint;
  exchange: bigint;
  sign: bigint;
  teardown: bigint;
  dispose: bigint;
}

export class Machine {
  private readonly engine: Engine;
  private readonly shims: Shims;
  private readonly entry: EntryPoints;

  private scratchCursor = 0n;
  private closed = false;

  private constructor(engine: Engine, shims: Shims, entry: EntryPoints) {
    this.engine = engine;
    this.shims = shims;
    this.entry = entry;
  }

  static async open(bundle: AssetBundle): Promise<Machine> {
    const coreFP = new MachImage("CoreFP", bundle.coreFP);
    const commerceCore = new MachImage("CommerceCore", bundle.commerceCore);
    const commerceKit = new MachImage("CommerceKit", bundle.commerceKit);

    const exports = new Map<string, bigint>();
    const coreExports = new Map<string, bigint>();

    for (const name of CORE_EXPORT_NAMES) {
      const address = coreFP.export(name, CORE_FP_BASE);
      exports.set(name, address);
      coreExports.set(name, address);
    }

    exports.set(
      "_get_mac_address",
      commerceCore.export("_get_mac_address", COMMERCE_BASE),
    );

    const entry = {} as EntryPoints;
    for (const [role, symbol] of Object.entries(ENTRY_NAMES)) {
      const address = commerceKit.export(symbol, KIT_BASE);
      exports.set(symbol, address);
      entry[role as keyof EntryPoints] = address;
    }

    const engine = await Engine.create();

    for (const [address, size] of [
      [RETURN_ADDRESS, PAGE_SIZE],
      [SCRATCH_BASE, SCRATCH_SIZE],
      [HEAP_BASE, HEAP_SIZE],
      [STACK_BASE, STACK_SIZE],
    ] as const) {
      engine.memMap(address, size);
    }

    // A lone HLT the guest returns into, so a finished call stops the engine.
    engine.memWrite(RETURN_ADDRESS, new Uint8Array([0xf4]));

    const shims = new Shims(engine);
    registerPlatformServices(shims, engine, coreExports, bundle.coreFPICXS);
    shims.installHook();

    const resolve = (name: string): bigint =>
      exports.get(name) ?? shims.resolve(name);

    for (const [image, base] of [
      [coreFP, CORE_FP_BASE],
      [commerceCore, COMMERCE_BASE],
      [commerceKit, KIT_BASE],
    ] as const) {
      image.relocate(base, resolve);
      image.load(engine);
    }

    return new Machine(engine, shims, entry);
  }

  /** Starts a SAP session for a hardware identity and returns its context. */
  initialize(hardwareID: Uint8Array): bigint {
    const hardware = hardwareBlock(hardwareID);
    this.beginCall();

    try {
      const contextField = this.scratch(null, 8n);
      const hardwareAddress = this.scratch(hardware, BigInt(hardware.length));

      const status = this.invoke(this.entry.initialize, contextField, hardwareAddress);
      if (asInt32(status) !== 0) {
        throw new Error(`SAP initialization returned ${asInt32(status)}`);
      }

      const context = this.engine.readUint64(contextField);
      if (context === 0n) {
        throw new Error("SAP initialization returned a null context");
      }

      return context;
    } finally {
      this.clearScratch();
    }
  }

  /** Drives one round of the SAP setup handshake. */
  exchange(
    version: number,
    hardwareID: Uint8Array,
    context: bigint,
    input: Uint8Array,
  ): { output: Uint8Array; state: number } {
    const hardware = hardwareBlock(hardwareID);
    this.beginCall();

    try {
      const hardwareAddress = this.scratch(hardware, BigInt(hardware.length));
      const inputAddress = this.scratch(input, BigInt(input.length));
      const outputField = this.scratch(null, 8n);
      const lengthField = this.scratch(null, 8n);
      const resultField = this.scratch(null, 4n);

      const status = this.invoke(
        this.entry.exchange,
        BigInt(version),
        hardwareAddress,
        context,
        inputAddress,
        BigInt(input.length),
        outputField,
        lengthField,
        resultField,
      );
      if (asInt32(status) !== 0) {
        throw new Error(`SAP exchange returned ${asInt32(status)}`);
      }

      const output = this.consumeOutput(outputField, lengthField);
      return { output, state: this.engine.readUint32(resultField) | 0 };
    } finally {
      this.clearScratch();
    }
  }

  /** Signs a request payload once setup has completed. */
  sign(context: bigint, input: Uint8Array): Uint8Array {
    this.beginCall();

    try {
      const inputAddress = this.scratch(input, BigInt(input.length));
      const outputField = this.scratch(null, 8n);
      const lengthField = this.scratch(null, 8n);

      const status = this.invoke(
        this.entry.sign,
        context,
        inputAddress,
        BigInt(input.length),
        outputField,
        lengthField,
      );
      if (asInt32(status) !== 0) {
        throw new Error(`SAP signing returned ${asInt32(status)}`);
      }

      return this.consumeOutput(outputField, lengthField);
    } finally {
      this.clearScratch();
    }
  }

  teardown(context: bigint): void {
    const status = this.invoke(this.entry.teardown, context);
    if (asInt32(status) !== 0) {
      throw new Error(`SAP teardown returned ${asInt32(status)}`);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.engine.close();
  }

  /** Reports each guest service call; see Shims.trace. */
  setTrace(trace: ((name: string) => void) | null): void {
    this.shims.trace = trace;
  }

  /**
   * Reports every instruction the guest reaches. Very slow, and only useful
   * for finding where a run goes wrong: the guest is an opaque binary and
   * this build reports an invalid opcode as a module trap with no address.
   */
  traceInstructions(callback: (address: bigint) => void): void {
    this.engine.addCodeHook(1n, 0n, callback);
  }

  /** Reads a register by the names Engine exposes, for diagnostics. */
  register(name: "rax" | "rdi" | "rsi" | "rsp" | "rip"): bigint {
    const map = {
      rax: this.engine.regRAX,
      rdi: this.engine.regRDI,
      rsi: this.engine.regRSI,
      rsp: this.engine.regRSP,
      rip: this.engine.regRIP,
    };
    return this.engine.regRead(map[name]);
  }

  /** Reports guest accesses to unmapped memory; see Engine.addUnmappedHook. */
  setUnmappedTrace(
    trace: (kind: string, address: bigint, size: number) => void,
  ): void {
    this.engine.addUnmappedHook(trace);
  }

  /** Reads guest memory. For diagnosing a run against the Go implementation. */
  peek(address: bigint, size: number): Uint8Array {
    return this.engine.memRead(address, size);
  }

  entryPoints(): Readonly<EntryPoints> {
    return this.entry;
  }

  // ---- guest calls --------------------------------------------------------

  private invoke(func: bigint, ...args: bigint[]): bigint {
    if (this.closed) throw new Error("SAP guest machine is closed");
    if (func === 0n) throw new Error("SAP guest entry point is unavailable");

    const registers = [
      this.engine.regRDI,
      this.engine.regRSI,
      this.engine.regRDX,
      this.engine.regRCX,
      this.engine.regR8,
      this.engine.regR9,
    ];

    for (let index = 0; index < registers.length; index++) {
      this.engine.regWrite(registers[index], args[index] ?? 0n);
    }

    const extra = Math.max(args.length - registers.length, 0);

    // The System V ABI wants RSP+8 to be 16-byte aligned at the entry point,
    // which after the pushed return address means RSP % 16 == 8.
    let stackPointer = STACK_END - BigInt(extra + 1) * 8n;
    if (stackPointer % 16n !== 8n) stackPointer -= 8n;

    this.engine.writeUint64(stackPointer, RETURN_ADDRESS);
    for (let index = 0; index < extra; index++) {
      this.engine.writeUint64(
        stackPointer + 8n + BigInt(index) * 8n,
        args[registers.length + index],
      );
    }
    this.engine.regWrite(this.engine.regRSP, stackPointer);

    this.shims.resetFault();

    try {
      this.run(func);
    } catch (error) {
      if (this.shims.fault) throw this.shims.fault;
      throw new Error(
        `execute SAP guest function: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (this.shims.fault) throw this.shims.fault;

    const instruction = this.engine.regRead(this.engine.regRIP);
    if (instruction !== RETURN_ADDRESS) {
      throw new Error(`SAP guest stopped unexpectedly at 0x${instruction.toString(16)}`);
    }

    return this.engine.regRead(this.engine.regRAX);
  }

  /**
   * Runs the guest from `start` until it returns to the trampoline, splitting
   * any basic block that would exceed what unicorn.js can translate.
   *
   * The split is transparent to the guest: a HLT replaces one byte, execution
   * stops on it with RIP at that address, the original byte goes back, and
   * execution resumes from the same place. Only the emulator notices, and only
   * by translating a shorter block.
   */
  private run(start: bigint): void {
    let address = start;
    let budget = INSTRUCTION_LIMIT;

    while (budget > 0) {
      const block = this.measure(address);

      if (!block) {
        // Undecodable: let the emulator run unassisted, which is no worse
        // than not splitting at all.
        this.segment(address, budget, null);
        budget = 0;
      } else if (!block.complete) {
        // Too long to translate whole. Stop it at the last safe boundary and
        // resume from there; the guest cannot tell, only the translator can.
        this.segment(address, block.instructions, address + BigInt(block.end));
        budget -= block.instructions;
      } else {
        // Run the body first, so the terminator executes on its own. Taking
        // a branch also translates its target, so the target's block has to
        // be made safe before the branch runs, not after.
        const body = block.instructions - 1;
        if (body > 0) {
          this.segment(address, body, null);
          budget -= body;
        }

        const terminator = address + BigInt(block.terminator!.offset);
        const current = this.engine.regRead(this.engine.regRIP);
        if (current === RETURN_ADDRESS || this.shims.fault) return;
        if (body > 0 && current !== terminator) {
          address = current;
          continue;
        }

        this.segment(terminator, 1, this.targetCut(block, address));
        budget -= 1;
      }

      let next = this.engine.regRead(this.engine.regRIP);
      if (next === RETURN_ADDRESS || this.shims.fault) return;

      if (next === address) {
        // A segment can legitimately stop where it started, for instance when
        // the split point falls on the instruction about to run and the guard
        // drops it. Step once unassisted to get past it.
        this.segment(address, 1, null);
        budget -= 1;

        next = this.engine.regRead(this.engine.regRIP);
        if (next === RETURN_ADDRESS || this.shims.fault) return;
        if (next === address) {
          throw new Error(`SAP guest made no progress at 0x${address.toString(16)}`);
        }
      }

      address = next;
    }

    throw new Error("SAP guest exceeded its instruction budget");
  }

  /** Runs `count` instructions from `address`, with `cut` held as a HLT. */
  private segment(address: bigint, count: number, cut: bigint | null): void {
    // A tight loop can put the split point on the very branch about to run —
    // the back edge of a nine-instruction loop lands there whenever the limit
    // is eight. Overwriting it would leave the tail of that branch stranded as
    // its own instruction, so leave short blocks unsplit instead.
    if (cut !== null && cut >= address && cut < address + 16n) {
      cut = null;
    }

    let original = 0;
    if (cut !== null) {
      original = this.engine.memRead(cut, 1)[0];
      this.engine.memWrite(cut, new Uint8Array([0xf4]));
    }

    try {
      this.engine.start(address, RETURN_ADDRESS, EXECUTION_TIMEOUT_MICROS, count);
    } finally {
      if (cut !== null) this.engine.memWrite(cut, new Uint8Array([original]));
    }
  }

  /**
   * Where to plant a HLT so the block a terminator jumps into is safe to
   * translate, or null when the target is unknown or already short.
   *
   * Direct branches carry their displacement; a return reads its target off
   * the stack. Indirect branches would need the effective address evaluated,
   * so they go unhandled and rely on their target being short.
   */
  private targetCut(block: Block, base: bigint): bigint | null {
    const { offset, decoded } = block.terminator!;
    const address = base + BigInt(offset);

    let target: bigint;
    try {
      if (decoded.relative !== undefined) {
        target = address + BigInt(decoded.length + decoded.relative);
      } else if (decoded.indirect) {
        const resolved = this.indirectTarget(decoded, address);
        if (resolved === null) return null;
        target = resolved;
      } else if (this.engine.memRead(address, 1)[0] === 0xc3) {
        target = this.engine.readUint64(this.engine.regRead(this.engine.regRSP));
      } else {
        return null;
      }
    } catch {
      return null;
    }

    const measured = this.measure(target);
    return measured && !measured.complete ? target + BigInt(measured.end) : null;
  }

  /** Evaluates the destination of an indirect call or jump. */
  private indirectTarget(decoded: Decoded, address: bigint): bigint | null {
    const form = decoded.indirect!;
    if (form.register !== null) return this.engine.gpr(form.register);

    let effective = BigInt(form.displacement);

    if (form.ripRelative) {
      effective += address + BigInt(decoded.length);
    } else {
      if (form.base !== null) effective += this.engine.gpr(form.base);
      if (form.index !== null) {
        effective += this.engine.gpr(form.index) * BigInt(form.scale);
      }
    }

    return this.engine.readUint64(effective & ((1n << 64n) - 1n));
  }

  /**
   * Measures the block at `address`, or null when its code cannot be read or
   * decoded — in which case the caller falls back to letting the emulator run
   * unassisted, which is no worse than not splitting at all.
   */
  private measure(address: bigint): Block | null {
    try {
      const window = this.engine.memRead(address, CODE_WINDOW);
      return measureBlock(window, 0, MAX_BLOCK_INSTRUCTIONS);
    } catch {
      return null;
    }
  }

  private beginCall(): void {
    this.scratchCursor = 0n;
  }

  /** Bump allocator for one call's arguments and output slots. */
  private scratch(data: Uint8Array | null, size: bigint): bigint {
    const reserved = align(size > 1n ? size : 1n, 16n);
    if (this.scratchCursor > SCRATCH_SIZE || reserved > SCRATCH_SIZE - this.scratchCursor) {
      throw new Error("SAP guest scratch space exhausted");
    }

    const address = SCRATCH_BASE + this.scratchCursor;
    this.scratchCursor += reserved;

    if (data && data.length !== 0) {
      if (BigInt(data.length) > size) {
        throw new Error("scratch data exceeds reservation");
      }
      this.engine.memWrite(address, data);
    } else if (size !== 0n) {
      this.engine.memZero(address, Number(size));
    }

    return address;
  }

  private clearScratch(): void {
    if (this.scratchCursor !== 0n && !this.closed) {
      this.engine.memZero(SCRATCH_BASE, Number(this.scratchCursor));
    }
    this.scratchCursor = 0n;
  }

  /** Reads a guest-allocated buffer, then hands it back to the guest. */
  private consumeOutput(pointerField: bigint, lengthField: bigint): Uint8Array {
    const pointer = this.engine.readUint64(pointerField);
    const length = this.engine.readUint64(lengthField);

    let output = new Uint8Array(0);
    let failure: Error | null = null;

    if (length > MAX_OUTPUT_SIZE) {
      failure = new Error(`SAP output is ${length} bytes, maximum is ${MAX_OUTPUT_SIZE}`);
    } else if (length !== 0n) {
      if (pointer === 0n) {
        failure = new Error("SAP returned a null output pointer");
      } else {
        output = new Uint8Array(this.engine.memRead(pointer, Number(length)));
      }
    }

    if (pointer !== 0n) {
      const status = this.invoke(this.entry.dispose, pointer);
      if (asInt32(status) !== 0 && !failure) {
        failure = new Error(`SAP dispose returned ${asInt32(status)}`);
      }
    }

    if (failure) throw failure;
    return output;
  }
}

/** The guest expects a length-prefixed hardware identity in a 24-byte block. */
function hardwareBlock(hardwareID: Uint8Array): Uint8Array {
  if (hardwareID.length === 0 || hardwareID.length > 20) {
    throw new Error("hardware ID must contain between 1 and 20 bytes");
  }

  const result = new Uint8Array(24);
  new DataView(result.buffer).setUint32(0, hardwareID.length, true);
  result.set(hardwareID, 4);

  return result;
}

function asInt32(value: bigint): number {
  return Number(BigInt.asIntN(32, value));
}
