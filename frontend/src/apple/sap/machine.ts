// SAP guest machine: maps the CommerceKit/CommerceCore/CoreFP images into an
// emulated x86_64 Unicorn instance and drives the obfuscated SAP entry points.
// Ported from ipatool's internal/sap/machine/machine.go.

import { UnicornEngine, X86_REG } from "./engine";
import { MachImage } from "./machImage";
import { Shims, HEAP_BASE, HEAP_SIZE } from "./shims";

const SAP_GUEST_TIMEOUT_US = 60 * 1000 * 1000; // one minute, wall clock

const RETURN_ADDRESS = 0x0000000100000000;
const CORE_FP_BASE = 0x0000100000000000;
const COMMERCE_BASE = 0x0000100040000000;
const KIT_BASE = 0x0000100080000000;
const SCRATCH_BASE = 0x0000300000000000;
const SCRATCH_SIZE = 32 << 20;
const STACK_BASE = 0x0000500000000000;
const STACK_SIZE = 8 << 20;
const STACK_END = STACK_BASE + STACK_SIZE;
const PAGE_SIZE = 0x1000;
const MAX_OUTPUT_SIZE = 16 << 20;

const CORE_EXPORT_NAMES = [
  "_WIn9UJ86JKdV4dM",
  "_X46O5IeS",
  "_YlCJ3lg",
  "_dku592fbFAj",
  "_fdjkDSAFjklaf2s",
  "_lxpgvVMLd0S7uRl",
];

const ENTRY_INITIALIZE = "_cp2g1b9ro";
const ENTRY_EXCHANGE = "_Mib5yocT";
const ENTRY_SIGN = "_Fc3vhtJDvr";
const ENTRY_TEARDOWN = "_IPaI1oem5iL";
const ENTRY_DISPOSE = "_jEHf8Xzsv8K";

export interface SapAssets {
  commerceKit: Uint8Array;
  commerceCore: Uint8Array;
  coreFP: Uint8Array;
  coreFPICXS: Uint8Array;
}

interface EntryPoints {
  initialize: number;
  exchange: number;
  sign: number;
  teardown: number;
  dispose: number;
}

function align(value: number, alignment: number): number {
  // Math-based: JS bitwise ops are 32-bit and truncate SAP guest addresses.
  return Math.floor((value + alignment - 1) / alignment) * alignment;
}

export function hardwareBlock(hardwareID: Uint8Array): Uint8Array {
  if (hardwareID.length === 0 || hardwareID.length > 20) {
    throw new Error("hardware ID must contain between 1 and 20 bytes");
  }
  const result = new Uint8Array(24);
  new DataView(result.buffer).setUint32(0, hardwareID.length, true);
  result.set(hardwareID, 4);
  return result;
}

export class SapMachine {
  private scratchCursor = 0;
  private closed = false;
  private readonly entry: EntryPoints;
  private readonly services: Shims;

  private constructor(
    private readonly engine: UnicornEngine,
    entry: EntryPoints,
    services: Shims,
  ) {
    this.entry = entry;
    this.services = services;
  }

  static async open(
    assets: SapAssets,
    options?: { wasmBinary?: ArrayBuffer },
  ): Promise<SapMachine> {
    const coreFP = MachImage.open("CoreFP", assets.coreFP);
    const commerceCore = MachImage.open("CommerceCore", assets.commerceCore);
    const commerceKit = MachImage.open("CommerceKit", assets.commerceKit);

    const exports = new Map<string, number>();
    const coreExports: Record<string, number> = {};

    for (const name of CORE_EXPORT_NAMES) {
      const address = coreFP.export(name, CORE_FP_BASE);
      exports.set(name, address);
      coreExports[name] = address;
    }

    exports.set(
      "_get_mac_address",
      commerceCore.export("_get_mac_address", COMMERCE_BASE),
    );

    const entryNames = [
      ENTRY_INITIALIZE,
      ENTRY_EXCHANGE,
      ENTRY_SIGN,
      ENTRY_TEARDOWN,
      ENTRY_DISPOSE,
    ];
    const resolved = new Map<string, number>();
    for (const name of entryNames) {
      const address = commerceKit.export(name, KIT_BASE);
      exports.set(name, address);
      resolved.set(name, address);
    }

    const engine = await UnicornEngine.open(options);

    for (const region of [
      { address: RETURN_ADDRESS, size: PAGE_SIZE },
      { address: SCRATCH_BASE, size: SCRATCH_SIZE },
      { address: HEAP_BASE, size: HEAP_SIZE }, // guest heap (malloc shims)
      { address: STACK_BASE, size: STACK_SIZE },
    ]) {
      engine.memMap(region.address, region.size);
    }
    engine.memWrite(RETURN_ADDRESS, new Uint8Array([0xf4])); // HLT

    const services = await Shims.open(engine, coreExports, assets.coreFPICXS);


    const resolver = (name: string): number => {
      const address = exports.get(name);
      if (address !== undefined) {
        return address;
      }
      return services.resolve(name);
    };

    for (const item of [
      { name: "corefp", image: coreFP, base: CORE_FP_BASE },
      { name: "commercecore", image: commerceCore, base: COMMERCE_BASE },
      { name: "commercekit", image: commerceKit, base: KIT_BASE },
    ]) {
      item.image.relocate(item.base, resolver);
      item.image.load(engine);
    }

    return new SapMachine(
      engine,
      {
        initialize: resolved.get(ENTRY_INITIALIZE)!,
        exchange: resolved.get(ENTRY_EXCHANGE)!,
        sign: resolved.get(ENTRY_SIGN)!,
        teardown: resolved.get(ENTRY_TEARDOWN)!,
        dispose: resolved.get(ENTRY_DISPOSE)!,
      },
      services,
    );
  }

  initialize(hardwareID: Uint8Array): number {
    const hardware = hardwareBlock(hardwareID);
    this.beginCall();
    try {
      const contextField = this.scratch(8);
      const hardwareAddress = this.scratch(hardware);
      const status = this.invoke(this.entry.initialize, [
        contextField,
        hardwareAddress,
      ]);
      if (toInt32(status) !== 0) {
        throw new Error(`SAP initialization returned ${toInt32(status)}`);
      }
      const contextValue = this.readUint64(contextField);
      if (contextValue === 0) {
        throw new Error("SAP initialization returned a null context");
      }
      return contextValue;
    } finally {
      this.clearScratch();
    }
  }

  exchange(
    version: number,
    hardwareID: Uint8Array,
    contextValue: number,
    input: Uint8Array,
  ): { output: Uint8Array; state: number } {
    const hardware = hardwareBlock(hardwareID);
    this.beginCall();
    try {
      const hardwareAddress = this.scratch(hardware);
      const inputAddress = this.scratch(input);
      const outputField = this.scratch(8);
      const lengthField = this.scratch(8);
      const resultField = this.scratch(4);
      const status = this.invoke(this.entry.exchange, [
        version,
        hardwareAddress,
        contextValue,
        inputAddress,
        input.length,
        outputField,
        lengthField,
        resultField,
      ]);
      if (toInt32(status) !== 0) {
        throw new Error(`SAP exchange returned ${toInt32(status)}`);
      }
      const output = this.consumeOutput(outputField, lengthField);
      const result = this.readUint32(resultField);
      return { output, state: toInt32(result) };
    } finally {
      this.clearScratch();
    }
  }

  sign(contextValue: number, input: Uint8Array): Uint8Array {
    this.beginCall();
    try {
      const inputAddress = this.scratch(input);
      const outputField = this.scratch(8);
      const lengthField = this.scratch(8);
      const status = this.invoke(this.entry.sign, [
        contextValue,
        inputAddress,
        input.length,
        outputField,
        lengthField,
      ]);
      if (toInt32(status) !== 0) {
        throw new Error(`SAP signing returned ${toInt32(status)}`);
      }
      return this.consumeOutput(outputField, lengthField);
    } finally {
      this.clearScratch();
    }
  }

  teardown(contextValue: number): void {
    const status = this.invoke(this.entry.teardown, [contextValue]);
    if (toInt32(status) !== 0) {
      throw new Error(`SAP teardown returned ${toInt32(status)}`);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.services.close();
    this.engine.close();
  }

  private invoke(functionAddress: number, args: number[]): number {
    if (this.closed) {
      throw new Error("SAP guest machine is closed");
    }
    if (functionAddress === 0) {
      throw new Error("SAP guest entry point is unavailable");
    }

    const registers = [
      X86_REG.RDI,
      X86_REG.RSI,
      X86_REG.RDX,
      X86_REG.RCX,
      X86_REG.R8,
      X86_REG.R9,
    ];
    for (let index = 0; index < registers.length; index++) {
      this.engine.regWrite(registers[index], args[index] ?? 0);
    }

    const extra = Math.max(args.length - registers.length, 0);
    let stackPointer = STACK_END - (extra + 1) * 8;
    if (stackPointer % 16 !== 8) {
      stackPointer -= 8;
    }

    this.writeUint64(stackPointer, RETURN_ADDRESS);
    for (let index = 0; index < extra; index++) {
      this.writeUint64(
        stackPointer + 8 + index * 8,
        args[registers.length + index],
      );
    }
    this.engine.regWrite(X86_REG.RSP, stackPointer);

    this.services.resetFault();

    try {
      // SAP's cryptographic routines have input- and host-dependent instruction
      // counts; bound execution by wall time rather than a fixed instruction cap.
      this.engine.emuStart(
        functionAddress,
        RETURN_ADDRESS,
        SAP_GUEST_TIMEOUT_US,
        0,
      );
    } catch (error) {
      if (this.services.fault) {
        throw this.services.fault;
      }
      throw error;
    }

    if (this.services.fault) {
      throw this.services.fault;
    }

    const instruction = this.engine.regRead(X86_REG.RIP);
    if (instruction !== RETURN_ADDRESS) {
      throw new Error(
        `SAP guest stopped unexpectedly at ${instruction.toString(16)}`,
      );
    }

    return this.engine.regRead(X86_REG.RAX);
  }

  private beginCall(): void {
    this.scratchCursor = 0;
  }

  private scratch(data: Uint8Array | number): number {
    const isData = typeof data !== "number";
    const size = isData ? (data as Uint8Array).length : data;
    const reserved = align(Math.max(size, 1), 16);
    if (
      this.scratchCursor > SCRATCH_SIZE ||
      reserved > SCRATCH_SIZE - this.scratchCursor
    ) {
      throw new Error("SAP guest scratch space exhausted");
    }
    const address = SCRATCH_BASE + this.scratchCursor;
    this.scratchCursor += reserved;
    if (size !== 0) {
      const bytes = isData ? (data as Uint8Array) : new Uint8Array(size);
      if (bytes.length > size) {
        throw new Error("scratch data exceeds reservation");
      }
      this.engine.memWrite(address, bytes);
    }
    return address;
  }

  private clearScratch(): void {
    if (this.scratchCursor !== 0 && !this.closed) {
      this.engine.memWrite(
        SCRATCH_BASE,
        new Uint8Array(this.scratchCursor),
      );
    }
    this.scratchCursor = 0;
  }

  private consumeOutput(pointerField: number, lengthField: number): Uint8Array {
    const pointer = this.readUint64(pointerField);
    const length = this.readUint64(lengthField);

    let output: Uint8Array | null = null;
    let outputError: Error | null = null;

    if (length > MAX_OUTPUT_SIZE) {
      outputError = new Error(
        `SAP output is ${length} bytes, maximum is ${MAX_OUTPUT_SIZE}`,
      );
    } else if (length === 0) {
      output = new Uint8Array(0);
    } else if (pointer === 0) {
      outputError = new Error("SAP returned a null output pointer");
    } else {
      output = this.engine.memRead(pointer, length);
    }

    if (pointer !== 0) {
      const disposeStatus = this.invoke(this.entry.dispose, [pointer]);
      if (toInt32(disposeStatus) !== 0 && !outputError) {
        outputError = new Error(`SAP storage disposal returned ${toInt32(disposeStatus)}`);
      }
    }

    if (outputError) {
      throw outputError;
    }
    return output!;
  }

  private readUint32(address: number): number {
    const data = this.engine.memRead(address, 4);
    return new DataView(data.buffer, data.byteOffset).getUint32(0, true);
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
}

function toInt32(value: number): number {
  return value | 0;
}
