// SAP signer worker: hosts the TCI emulation so its synchronous bursts never
// block the UI thread. Speaks a tiny request/response protocol with the main
// thread (see client.ts); all Apple network traffic stays on the main thread.

import { SapMachine } from "./machine";
import type { SapAssetBundle } from "./types";

interface OpenRequest {
  type: "open";
  id: number;
  assets: { [K in keyof SapAssetBundle]: ArrayBuffer };
  wasmBinary: ArrayBuffer;
}

interface InitializeRequest {
  type: "initialize";
  id: number;
  hardwareID: ArrayBuffer;
}

interface ExchangeRequest {
  type: "exchange";
  id: number;
  version: number;
  hardwareID: ArrayBuffer;
  contextValue: number;
  input: ArrayBuffer;
}

interface SignRequest {
  type: "sign";
  id: number;
  contextValue: number;
  input: ArrayBuffer;
}

interface TeardownRequest {
  type: "teardown";
  id: number;
  contextValue: number;
}

interface CloseRequest {
  type: "close";
  id: number;
}

type WorkerRequest =
  | OpenRequest
  | InitializeRequest
  | ExchangeRequest
  | SignRequest
  | TeardownRequest
  | CloseRequest;

let machine: SapMachine | null = null;
let hardwareID: Uint8Array | null = null;

function reply(id: number, payload: Record<string, unknown>): void {
  self.postMessage({ type: "result", id, ...payload });
}

function replyError(id: number, message: string): void {
  self.postMessage({ type: "error", id, message });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case "open": {
        if (machine) {
          machine.close();
        }
        machine = await SapMachine.open(
          {
            commerceKit: new Uint8Array(request.assets.commerceKit),
            commerceCore: new Uint8Array(request.assets.commerceCore),
            coreFP: new Uint8Array(request.assets.coreFP),
            coreFPICXS: new Uint8Array(request.assets.coreFPICXS),
          },
          { wasmBinary: request.wasmBinary },
        );
        hardwareID = new Uint8Array(0);
        reply(request.id, {});
        break;
      }
      case "initialize": {
        if (!machine) {
          throw new Error("SAP machine is not open");
        }
        hardwareID = new Uint8Array(request.hardwareID);
        const contextValue = machine.initialize(hardwareID);
        reply(request.id, { contextValue });
        break;
      }
      case "exchange": {
        if (!machine || !hardwareID) {
          throw new Error("SAP machine is not open");
        }
        const result = machine.exchange(
          request.version,
          new Uint8Array(request.hardwareID),
          request.contextValue,
          new Uint8Array(request.input),
        );
        reply(request.id, {
          output: result.output.buffer,
          state: result.state,
        });
        break;
      }
      case "sign": {
        if (!machine) {
          throw new Error("SAP machine is not open");
        }
        const signature = machine.sign(
          request.contextValue,
          new Uint8Array(request.input),
        );
        reply(request.id, { signature: signature.buffer });
        break;
      }
      case "teardown": {
        machine?.teardown(request.contextValue);
        reply(request.id, {});
        break;
      }
      case "close": {
        machine?.close();
        machine = null;
        hardwareID = null;
        reply(request.id, {});
        break;
      }
    }
  } catch (error) {
    replyError(
      request.id,
      error instanceof Error ? error.message : String(error),
    );
  }
};
