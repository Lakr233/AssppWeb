// Main-thread SAP signer client: spawns the emulation worker, shuttles
// machine calls to it, and exposes the SapSigner orchestration used by the
// authentication flow.

import { SapSigner, type SapMachineDriver } from "./signer";
import { exchangeSetupBuffer, fetchSetupCertificate } from "./protocol";
import type { SapSignerOptions } from "./types";

async function loadWorkerWasmBinary(): Promise<ArrayBuffer> {
  const url = new URL("./vendor/unicorn.wasm", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SAP engine download failed: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

interface WorkerResult {
  type: "result";
  id: number;
  [key: string]: unknown;
}

interface WorkerError {
  type: "error";
  id: number;
  message: string;
}

class WorkerMachineDriver implements SapMachineDriver {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: WorkerResult) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerResult | WorkerError>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) {
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "error") {
        entry.reject(new Error(message.message));
      } else {
        entry.resolve(message);
      }
    };
  }

  private call(request: Record<string, unknown>): Promise<WorkerResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  /** Loads the emulation runtime into the worker. */
  async open(
    assets: {
      commerceKit: Uint8Array;
      commerceCore: Uint8Array;
      coreFP: Uint8Array;
      coreFPICXS: Uint8Array;
    },
    wasmBinary: ArrayBuffer,
  ): Promise<void> {
    await this.call({
      type: "open",
      assets: {
        commerceKit: assets.commerceKit.slice().buffer,
        commerceCore: assets.commerceCore.slice().buffer,
        coreFP: assets.coreFP.slice().buffer,
        coreFPICXS: assets.coreFPICXS.slice().buffer,
      },
      wasmBinary,
    });
  }

  async initialize(hardwareID: Uint8Array): Promise<number> {
    const copy = hardwareID.slice();
    const result = await this.call({
      type: "initialize",
      hardwareID: copy.buffer,
    });
    return result.contextValue as number;
  }

  async exchange(
    version: number,
    hardwareID: Uint8Array,
    contextValue: number,
    input: Uint8Array,
  ): Promise<{ output: Uint8Array; state: number }> {
    const hw = hardwareID.slice();
    const payload = input.slice();
    const result = await this.call({
      type: "exchange",
      version,
      hardwareID: hw.buffer,
      contextValue,
      input: payload.buffer,
    });
    return {
      output: new Uint8Array(result.output as ArrayBuffer),
      state: result.state as number,
    };
  }

  async sign(contextValue: number, input: Uint8Array): Promise<Uint8Array> {
    const payload = input.slice();
    const result = await this.call({
      type: "sign",
      contextValue,
      input: payload.buffer,
    });
    return new Uint8Array(result.signature as ArrayBuffer);
  }

  async teardown(contextValue: number): Promise<void> {
    await this.call({ type: "teardown", contextValue });
  }

  async close(): Promise<void> {
    await this.call({ type: "close" });
    this.worker.terminate();
  }
}

/**
 * Creates a production signer: emulation runs in a dedicated worker, setup
 * network calls flow through the wisp tunnel on the main thread.
 */
export async function createSapSigner(
  options: SapSignerOptions,
): Promise<SapSigner> {
  const worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    { type: "module" },
  );
  const driver = new WorkerMachineDriver(worker);

  try {
    await driver.open(
      options.assets,
      options.wasmBinary ?? (await loadWorkerWasmBinary()),
    );
  } catch (error) {
    worker.terminate();
    throw error;
  }

  return SapSigner.create(options, driver, {
    fetchCertificate: () => fetchSetupCertificate(options),
    exchange: (input) => exchangeSetupBuffer(options, input),
  }).catch((error) => {
    worker.terminate();
    throw error;
  });
}
