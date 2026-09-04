// Main-thread SAP signer manager.
//
// The signer is kept as a module-level singleton bound to the hardware id it
// was initialized with: creating the worker copies the ~22.5 MB asset bundle
// into it, and repeating that per sign-in (2FA retries included) is pure
// waste. `prepareSigner` reuses a matching signer or rebuilds for a different
// account; concurrent callers share the same preparation. The zustand store
// in store/sap.ts carries progress for the UI.

import { SapSigner, type SapMachineDriver } from "./signer";
import { exchangeSetupBuffer, fetchSetupCertificate } from "./protocol";
import { loadSapAssets } from "./assets";
import type { SapEndpoints } from "./types";
import { useSapStore } from "../../store/sap";

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

const SETUP_TIMEOUT_MS = 2 * 60 * 1000;

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

  call(request: Record<string, unknown>): Promise<WorkerResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

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

interface PreparedSigner {
  signer: SapSigner;
  driver: WorkerMachineDriver;
  hardwareID: string;
  endpoints: SapEndpoints;
}

let prepared: PreparedSigner | null = null;
let preparation: Promise<PreparedSigner> | null = null;
let wasmBinary: ArrayBuffer | null = null;

async function loadWorkerWasmBinary(): Promise<ArrayBuffer> {
  if (wasmBinary) {
    return wasmBinary;
  }
  const url = new URL("./vendor/unicorn.wasm", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SAP engine download failed: HTTP ${response.status}`);
  }
  wasmBinary = await response.arrayBuffer();
  return wasmBinary;
}

/**
 * Returns a ready signer for the hardware id, reusing the current one when
 * it matches. Concurrent callers share a single preparation; the setup
 * network exchange rides the wisp tunnel on the main thread.
 */
export async function prepareSigner(
  hardwareID: string,
  endpoints: SapEndpoints,
): Promise<SapSigner> {
  if (
    prepared &&
    prepared.hardwareID === hardwareID &&
    endpointsEqual(prepared.endpoints, endpoints)
  ) {
    return prepared.signer;
  }
  if (preparation) {
    const underway = await preparation.catch(() => null);
    if (
      underway &&
      underway.hardwareID === hardwareID &&
      endpointsEqual(underway.endpoints, endpoints)
    ) {
      return underway.signer;
    }
  }

  preparation = runPreparation(hardwareID, endpoints);
  try {
    return (await preparation).signer;
  } finally {
    preparation = null;
  }
}

async function runPreparation(
  hardwareID: string,
  endpoints: SapEndpoints,
): Promise<PreparedSigner> {
  useSapStore.getState().begin(hardwareID);

  const previous = prepared;
  prepared = null;
  try {
    // Tear down the old signer first: the worker holds ~160 MB of wasm heap.
    await previous?.driver.close().catch(() => undefined);

    const assets = await loadSapAssets((loaded, total) =>
      useSapStore
        .getState()
        .setAssets(total ? Math.round((loaded / total) * 100) : 0),
    );
    useSapStore.getState().setSetup();

    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const driver = new WorkerMachineDriver(worker);
    const wasm = await loadWorkerWasmBinary();
    await driver.open(assets, wasm);

    const signer = await SapSigner.create(
      {
        ...endpoints,
        hardwareID: new TextEncoder().encode(hardwareID),
        assets,
      },
      driver,
      {
        fetchCertificate: () => fetchSetupCertificate(endpoints),
        exchange: (input) => exchangeSetupBuffer(endpoints, input),
      },
    );

    const result = { signer, driver, hardwareID, endpoints };
    prepared = result;
    useSapStore.getState().setReady();
    return result;
  } catch (error) {
    useSapStore
      .getState()
      .setError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Signs body bytes, preparing the signer on demand. */
export async function signWithSap(
  hardwareID: string,
  endpoints: SapEndpoints,
  body: Uint8Array,
): Promise<string> {
  const signer = await prepareSigner(hardwareID, endpoints);
  return signer.sign(body);
}

function endpointsEqual(left: SapEndpoints, right: SapEndpoints): boolean {
  return (
    left.certificateURL === right.certificateURL &&
    left.setupURL === right.setupURL &&
    left.version === right.version
  );
}
