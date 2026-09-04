// Unicorn 2.x WASM engine wrapper (x86_64 guest) for the SAP signer.
//
// The vendored emscripten build exposes a double-based glue API (see
// frontend/scripts/build-unicorn-wasm.sh): all 64-bit guest addresses cross
// the boundary as JS numbers, which is exact for integers below 2^53 — the
// SAP guest memory map stays below 2^48.

// Unicorn x86_64 register IDs (unicorn/x86.h).
export const X86_REG = {
  RAX: 35,
  RCX: 38,
  RDI: 39,
  RDX: 40,
  RIP: 41,
  RSI: 43,
  RSP: 44,
  R8: 106,
  R9: 107,
} as const;

export const UC_ARCH_X86 = 4;
export const UC_MODE_64 = 8;

interface UnicornGlueModule {
  _uc2_open(arch: number, mode: number): number;
  _uc2_close(uc: number): number;
  _uc2_strerror(code: number): number;
  _uc2_mem_map(uc: number, address: number, size: number): number;
  _uc2_mem_unmap(uc: number, address: number, size: number): number;
  _uc2_mem_write(
    uc: number,
    address: number,
    bufferOffset: number,
    length: number,
  ): number;
  _uc2_mem_read(
    uc: number,
    address: number,
    bufferOffset: number,
    length: number,
  ): number;
  _uc2_reg_write(uc: number, regid: number, value: number): number;
  _uc2_reg_read(uc: number, regid: number): number;
  _uc2_emu_start(
    uc: number,
    begin: number,
    until: number,
    timeoutUs: number,
    count: number,
  ): number;
  _uc2_emu_stop(uc: number): number;
  _uc2_hook_add_code(uc: number, begin: number, end: number): number;
  _uc2_hook_del(uc: number, handle: number): number;
  _uc2_set_code_hook_cb(fpIndex: number): void;
  _uc2_scratch_alloc(length: number): number;
  _uc2_scratch_free(offset: number): void;
  addFunction(fn: (...args: unknown[]) => void, signature: string): number;
  removeFunction(fpIndex: number): void;
  UTF8ToString(ptr: number): string;
  HEAPU8: Uint8Array;
}

type UnicornFactory = (
  config?: Record<string, unknown>,
) => Promise<UnicornGlueModule>;

let factoryPromise: Promise<UnicornFactory> | null = null;

async function loadFactory(): Promise<UnicornFactory> {
  if (!factoryPromise) {
    factoryPromise = import("./vendor/unicorn.mjs").then(
      (mod) => mod.default as UnicornFactory,
    );
  }
  return factoryPromise;
}

function throwIfError(module: UnicornGlueModule, code: number, what: string) {
  if (code === 0) {
    return;
  }
  const messagePtr = module._uc2_strerror(code);
  const detail = messagePtr ? module.UTF8ToString(messagePtr) : `code ${code}`;
  throw new Error(`${what}: ${detail}`);
}

export class UnicornEngine {
  /** Set by the machine; invoked for every hooked address. */
  onCodeHook: ((address: number, size: number) => void) | null = null;

  private hookPointer = 0;

  private constructor(
    private readonly module: UnicornGlueModule,
    private readonly handle: number,
  ) {}

  static async open(
    options?: { wasmBinary?: ArrayBuffer },
  ): Promise<UnicornEngine> {
    const factory = await loadFactory();
    const config: Record<string, unknown> = {};
    if (options?.wasmBinary) {
      config.wasmBinary = options.wasmBinary;
    }
    const module = await factory(config);

    const handle = module._uc2_open(UC_ARCH_X86, UC_MODE_64);
    if (handle === 0) {
      throw new Error("uc_open failed");
    }

    return new UnicornEngine(module, handle);
  }

  /** Install the engine-wide code hook callback and register its table slot. */
  attachCodeHook(): void {
    if (this.hookPointer !== 0) {
      return;
    }
    let engineRef: UnicornEngine | null = null;
    this.hookPointer = this.module.addFunction(
      ((address: number, size: number) => {
        engineRef?.onCodeHook?.(address, size);
      }) as unknown as (...args: unknown[]) => void,
      "vdi",
    );
    this.module._uc2_set_code_hook_cb(this.hookPointer);
    engineRef = this;
  }

  detachCodeHook(): void {
    if (this.hookPointer === 0) {
      return;
    }
    this.module.removeFunction(this.hookPointer);
    this.hookPointer = 0;
  }

  memMap(address: number, size: number): void {
    throwIfError(
      this.module,
      this.module._uc2_mem_map(this.handle, address, size),
      `mem_map(${address.toString(16)})`,
    );
  }

  memUnmap(address: number, size: number): void {
    throwIfError(
      this.module,
      this.module._uc2_mem_unmap(this.handle, address, size),
      `mem_unmap(${address.toString(16)})`,
    );
  }

  memWrite(address: number, data: Uint8Array): void {
    if (data.length === 0) {
      return;
    }
    const offset = this.module._uc2_scratch_alloc(data.length);
    if (offset === 0) {
      throw new Error("scratch alloc failed");
    }
    try {
      this.module.HEAPU8.set(data, offset);
      throwIfError(
        this.module,
        this.module._uc2_mem_write(
          this.handle,
          address,
          offset,
          data.length,
        ),
        `mem_write(${address.toString(16)}, ${data.length})`,
      );
    } finally {
      this.module._uc2_scratch_free(offset);
    }
  }

  memRead(address: number, length: number): Uint8Array {
    const output = new Uint8Array(length);
    if (length === 0) {
      return output;
    }
    const offset = this.module._uc2_scratch_alloc(length);
    if (offset === 0) {
      throw new Error("scratch alloc failed");
    }
    try {
      throwIfError(
        this.module,
        this.module._uc2_mem_read(this.handle, address, offset, length),
        `mem_read(${address.toString(16)}, ${length})`,
      );
      output.set(this.module.HEAPU8.subarray(offset, offset + length));
      return output;
    } finally {
      this.module._uc2_scratch_free(offset);
    }
  }

  regRead(register: number): number {
    const value = this.module._uc2_reg_read(this.handle, register);
    if (value === -1) {
      throw new Error(`reg_read(${register}) failed`);
    }
    return value;
  }

  regWrite(register: number, value: number): void {
    throwIfError(
      this.module,
      this.module._uc2_reg_write(this.handle, register, value),
      `reg_write(${register})`,
    );
  }

  emuStart(
    begin: number,
    until: number,
    timeoutUs: number,
    count: number,
  ): void {
    throwIfError(
      this.module,
      this.module._uc2_emu_start(this.handle, begin, until, timeoutUs, count),
      `emu_start(${begin.toString(16)}, ${until.toString(16)})`,
    );
  }

  emuStop(): void {
    throwIfError(
      this.module,
      this.module._uc2_emu_stop(this.handle),
      "emu_stop",
    );
  }

  /** Temporary diagnostic: report unmapped memory accesses from the guest. */
  onMemoryInvalid:
    | ((type: number, address: number, size: number, value: number) => number)
    | null = null;

  attachMemoryInvalidHook(): void {
    const mod = this.module as unknown as {
      _uc2_hook_add_mem_invalid(uc: number): number;
      _uc2_set_mem_hook_cb(fp: number): void;
    };
    if (!mod._uc2_hook_add_mem_invalid) {
      return;
    }
    let engineRef: UnicornEngine | null = null;
    const fp = this.module.addFunction(
      ((type: number, address: number, size: number, value: number) =>
        engineRef?.onMemoryInvalid?.(type, address, size, value) ?? 0) as unknown as (
        ...args: unknown[]
      ) => number,
      "dddd",
    );
    mod._uc2_set_mem_hook_cb(fp);
    mod._uc2_hook_add_mem_invalid(this.handle);
    engineRef = this;
  }

  addCodeHook(
    begin: number,
    end: number,
  ): number {
    const handle = this.module._uc2_hook_add_code(this.handle, begin, end);
    if (handle === 0) {
      throw new Error("hook_add(UC_HOOK_CODE) failed");
    }
    return handle;
  }

  hookDel(handle: number): void {
    throwIfError(
      this.module,
      this.module._uc2_hook_del(this.handle, handle),
      "hook_del",
    );
  }

  close(): void {
    this.detachCodeHook();
    this.module._uc2_close(this.handle);
  }
}
