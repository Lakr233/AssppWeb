// Guest machine: maps the CommerceKit/CommerceCore/CoreFP images, plus any
// extra images such as StoreAgent, into an emulated x86_64 Unicorn instance
// and calls into them. Ported from ipatool's internal/sap/machine/machine.go.

import { UnicornEngine, X86_REG } from './engine';
import { MachImage } from './machImage';
import { Shims, HEAP_BASE, HEAP_SIZE } from './shims';
import type { KBSyncAssets } from './types';

const DEFAULT_GUEST_TIMEOUT_US = 60 * 1000 * 1000; // one minute, wall clock

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
  '_WIn9UJ86JKdV4dM',
  '_X46O5IeS',
  '_YlCJ3lg',
  '_dku592fbFAj',
  '_fdjkDSAFjklaf2s',
  '_lxpgvVMLd0S7uRl',
];

const KIT_EXPORT_NAMES = ['_cp2g1b9ro', '_Mib5yocT', '_Fc3vhtJDvr', '_IPaI1oem5iL', '_jEHf8Xzsv8K'];

export interface ImageSpec {
  name: string;
  data: Uint8Array;
  base: number;
}

export interface RuntimeOptions {
  extraImages?: ImageSpec[];
  zeroReturnAliases?: string[];
  wasmBinary?: ArrayBuffer;
}

function align(value: number, alignment: number): number {
  // Math-based: JS bitwise ops are 32-bit and truncate guest addresses.
  return Math.floor((value + alignment - 1) / alignment) * alignment;
}

export function hardwareBlock(hardwareID: Uint8Array): Uint8Array {
  if (hardwareID.length === 0 || hardwareID.length > 20) {
    throw new Error('hardware ID must contain between 1 and 20 bytes');
  }
  const result = new Uint8Array(24);
  new DataView(result.buffer).setUint32(0, hardwareID.length, true);
  result.set(hardwareID, 4);
  return result;
}

export class GuestMachine {
  /** Entry that releases guest-allocated output buffers. */
  dispose = 0;
  private scratchCursor = 0;
  private closed = false;

  private constructor(
    private readonly engine: UnicornEngine,
    private readonly services: Shims,
  ) {}

  static async open(
    assets: KBSyncAssets,
    options: RuntimeOptions = {},
  ): Promise<{ machine: GuestMachine; exports: Map<string, number> }> {
    const imageSpecs: ImageSpec[] = [
      { name: 'CoreFP', data: assets.coreFP, base: CORE_FP_BASE },
      { name: 'CommerceCore', data: assets.commerceCore, base: COMMERCE_BASE },
      { name: 'CommerceKit', data: assets.commerceKit, base: KIT_BASE },
      ...(options.extraImages ?? []),
    ];
    const images = new Map(imageSpecs.map((spec) => [spec.name, MachImage.open(spec.name, spec.data)]));

    const exports = new Map<string, number>();
    const coreExports: Record<string, number> = {};
    const coreFP = images.get('CoreFP')!;
    for (const name of CORE_EXPORT_NAMES) {
      const address = coreFP.export(name, CORE_FP_BASE);
      exports.set(name, address);
      coreExports[name] = address;
    }
    exports.set('_get_mac_address', images.get('CommerceCore')!.export('_get_mac_address', COMMERCE_BASE));
    const commerceKit = images.get('CommerceKit')!;
    for (const name of KIT_EXPORT_NAMES) {
      exports.set(name, commerceKit.export(name, KIT_BASE));
    }

    const engine = await UnicornEngine.open({ wasmBinary: options.wasmBinary });
    try {
      for (const region of [
        { address: RETURN_ADDRESS, size: PAGE_SIZE },
        { address: SCRATCH_BASE, size: SCRATCH_SIZE },
        { address: HEAP_BASE, size: HEAP_SIZE }, // guest heap (malloc shims)
        { address: STACK_BASE, size: STACK_SIZE },
      ]) {
        engine.memMap(region.address, region.size);
      }
      engine.memWrite(RETURN_ADDRESS, new Uint8Array([0xf4])); // HLT

      const services = await Shims.open(engine, coreExports, assets.coreFPICXS, {
        zeroReturnAliases: options.zeroReturnAliases,
      });

      const resolver = (name: string): number => exports.get(name) ?? services.resolve(name);
      for (const spec of imageSpecs) {
        const image = images.get(spec.name)!;
        image.relocate(spec.base, resolver);
        image.load(engine);
      }

      return { machine: new GuestMachine(engine, services), exports };
    } catch (error) {
      engine.close();
      throw error;
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

  invoke(functionAddress: number, args: number[], timeoutUs = DEFAULT_GUEST_TIMEOUT_US): number {
    if (this.closed) {
      throw new Error('guest machine is closed');
    }
    if (functionAddress === 0) {
      throw new Error('guest entry point is unavailable');
    }

    const registers = [X86_REG.RDI, X86_REG.RSI, X86_REG.RDX, X86_REG.RCX, X86_REG.R8, X86_REG.R9];
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
      this.writeUint64(stackPointer + 8 + index * 8, args[registers.length + index]);
    }
    this.engine.regWrite(X86_REG.RSP, stackPointer);

    this.services.resetFault();

    try {
      // Guest cryptographic routines have input- and host-dependent instruction
      // counts; bound execution by wall time rather than a fixed instruction cap.
      this.engine.emuStart(functionAddress, RETURN_ADDRESS, timeoutUs, 0);
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
      throw new Error(`guest stopped unexpectedly at ${instruction.toString(16)}`);
    }

    return this.engine.regRead(X86_REG.RAX);
  }

  beginCall(): void {
    this.scratchCursor = 0;
  }

  scratch(data: Uint8Array | number): number {
    const isData = typeof data !== 'number';
    const size = isData ? data.length : data;
    const reserved = align(Math.max(size, 1), 16);
    if (this.scratchCursor > SCRATCH_SIZE || reserved > SCRATCH_SIZE - this.scratchCursor) {
      throw new Error('guest scratch space exhausted');
    }
    const address = SCRATCH_BASE + this.scratchCursor;
    this.scratchCursor += reserved;
    if (size !== 0) {
      this.engine.memWrite(address, isData ? data : new Uint8Array(size));
    }
    return address;
  }

  clearScratch(): void {
    if (this.scratchCursor !== 0 && !this.closed) {
      this.engine.memWrite(SCRATCH_BASE, new Uint8Array(this.scratchCursor));
    }
    this.scratchCursor = 0;
  }

  consumeOutput(pointerField: number, lengthField: number): Uint8Array {
    const pointer = this.readUint64(pointerField);
    const length = this.readUint64(lengthField);

    let output: Uint8Array | null = null;
    let outputError: Error | null = null;

    if (length > MAX_OUTPUT_SIZE) {
      outputError = new Error(`guest output is ${length} bytes, maximum is ${MAX_OUTPUT_SIZE}`);
    } else if (length === 0) {
      output = new Uint8Array(0);
    } else if (pointer === 0) {
      outputError = new Error('guest returned a null output pointer');
    } else {
      output = this.engine.memRead(pointer, length);
    }

    if (pointer !== 0) {
      const disposeStatus = this.invoke(this.dispose, [pointer]);
      if (toInt32(disposeStatus) !== 0 && !outputError) {
        outputError = new Error(`guest storage disposal returned ${toInt32(disposeStatus)}`);
      }
    }

    if (outputError) {
      throw outputError;
    }
    return output!;
  }

  readUint32(address: number): number {
    const data = this.engine.memRead(address, 4);
    return new DataView(data.buffer, data.byteOffset).getUint32(0, true);
  }

  readUint64(address: number): number {
    const data = this.engine.memRead(address, 8);
    return Number(new DataView(data.buffer, data.byteOffset).getBigUint64(0, true));
  }

  private writeUint64(address: number, value: number): void {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setBigUint64(0, BigInt(value), true);
    this.engine.memWrite(address, data);
  }
}

export function toInt32(value: number): number {
  return value | 0;
}
