// Thin wrapper over unicorn.js, matching the surface ipatool's
// internal/sap/unicorn exposes.
//
// ipatool loads libunicorn through purego and calls fourteen uc_* entry
// points. unicorn.js is the same engine (2.1.4) built to WebAssembly, and it
// provides all of them except uc_ctl, which is only used on Windows to shrink
// the TCG buffer and is a no-op everywhere else.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnicornModule = any;

let modulePromise: Promise<UnicornModule> | null = null;

/** Loads the x86 build of unicorn.js once per page. */
async function loadUnicorn(): Promise<UnicornModule> {
  if (!modulePromise) {
    modulePromise = import("@alexaltea/unicorn-js/x86").then(
      (module: { default: () => Promise<UnicornModule> }) => module.default(),
    );
  }
  return modulePromise;
}

export interface CodeHook {
  remove(): void;
}

export class Engine {
  private readonly uc: UnicornModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly engine: any;
  private closed = false;

  readonly regRDI: number;
  readonly regRSI: number;
  readonly regRDX: number;
  readonly regRCX: number;
  readonly regR8: number;
  readonly regR9: number;
  readonly regRSP: number;
  readonly regRAX: number;
  readonly regRIP: number;

  private constructor(uc: UnicornModule) {
    this.uc = uc;
    this.engine = new uc.Unicorn(uc.ARCH_X86, uc.MODE_64);

    this.regRDI = uc.X86_REG_RDI;
    this.regRSI = uc.X86_REG_RSI;
    this.regRDX = uc.X86_REG_RDX;
    this.regRCX = uc.X86_REG_RCX;
    this.regR8 = uc.X86_REG_R8;
    this.regR9 = uc.X86_REG_R9;
    this.regRSP = uc.X86_REG_RSP;
    this.regRAX = uc.X86_REG_RAX;
    this.regRIP = uc.X86_REG_RIP;
  }

  static async create(): Promise<Engine> {
    return new Engine(await loadUnicorn());
  }

  memMap(address: bigint, size: bigint): void {
    this.engine.mem_map(address, Number(size), this.uc.PROT_ALL);
  }

  memWrite(address: bigint, data: Uint8Array): void {
    if (data.length === 0) return;
    this.engine.mem_write(address, data);
  }

  memRead(address: bigint, size: number): Uint8Array {
    return this.engine.mem_read(address, size);
  }

  memZero(address: bigint, size: number): void {
    if (size === 0) return;
    this.engine.mem_write(address, new Uint8Array(size));
  }

  /** Reads a general-purpose register by its x86 encoding number, 0 to 15. */
  gpr(index: number): bigint {
    const order = [
      this.uc.X86_REG_RAX, this.uc.X86_REG_RCX, this.uc.X86_REG_RDX,
      this.uc.X86_REG_RBX, this.uc.X86_REG_RSP, this.uc.X86_REG_RBP,
      this.uc.X86_REG_RSI, this.uc.X86_REG_RDI, this.uc.X86_REG_R8,
      this.uc.X86_REG_R9, this.uc.X86_REG_R10, this.uc.X86_REG_R11,
      this.uc.X86_REG_R12, this.uc.X86_REG_R13, this.uc.X86_REG_R14,
      this.uc.X86_REG_R15,
    ];
    return this.regRead(order[index]);
  }

  regRead(register: number): bigint {
    return BigInt(this.engine.reg_read_i64(register)) & ((1n << 64n) - 1n);
  }

  regWrite(register: number, value: bigint): void {
    this.engine.reg_write_i64(register, BigInt.asIntN(64, value));
  }

  readUint32(address: bigint): number {
    const data = this.memRead(address, 4);
    return new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true);
  }

  readUint64(address: bigint): bigint {
    const data = this.memRead(address, 8);
    return new DataView(data.buffer, data.byteOffset, 8).getBigUint64(0, true);
  }

  writeUint32(address: bigint, value: number): void {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, value >>> 0, true);
    this.memWrite(address, data);
  }

  writeUint64(address: bigint, value: bigint): void {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setBigUint64(0, value & ((1n << 64n) - 1n), true);
    this.memWrite(address, data);
  }

  /** Installs a UC_HOOK_CODE over [begin, end], the only hook kind SAP needs. */
  addCodeHook(
    begin: bigint,
    end: bigint,
    callback: (address: bigint) => void,
  ): CodeHook {
    const handle = this.engine.hook_add(
      this.uc.HOOK_CODE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_handle: any, address: bigint | number) => {
        callback(typeof address === "bigint" ? address : BigInt(address));
      },
      {},
      begin,
      end,
    );

    return {
      remove: () => {
        this.engine.hook_del(handle);
      },
    };
  }

  /**
   * Reports guest accesses to unmapped memory. ipatool never needs this: the
   * Go build surfaces them as UC_ERR_READ_UNMAPPED from uc_emu_start, while
   * this WebAssembly build traps instead, losing the address. Catching them
   * here keeps the fault diagnosable.
   */
  addUnmappedHook(
    callback: (kind: string, address: bigint, size: number) => void,
  ): CodeHook {
    const kinds: Array<[number, string]> = [
      [this.uc.HOOK_MEM_READ_UNMAPPED, "read"],
      [this.uc.HOOK_MEM_WRITE_UNMAPPED, "write"],
      [this.uc.HOOK_MEM_FETCH_UNMAPPED, "fetch"],
    ];

    const mask = kinds.reduce((total, [flag]) => total | flag, 0);
    const handle = this.engine.hook_add(
      mask,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_handle: any, type: number, address: bigint | number, size: number) => {
        const kind = kinds.find(([flag]) => flag === type)?.[1] ?? String(type);
        callback(kind, typeof address === "bigint" ? address : BigInt(address), size);
        return false;
      },
      {},
      1n,
      0n,
    );

    return {
      remove: () => {
        this.engine.hook_del(handle);
      },
    };
  }

  start(begin: bigint, end: bigint, timeoutMicros: bigint, instructionLimit: number): void {
    this.engine.emu_start(begin, end, timeoutMicros, instructionLimit);
  }

  stop(): void {
    this.engine.emu_stop();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.engine.close();
  }
}
