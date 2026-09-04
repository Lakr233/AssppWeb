// SAP signer: sequences the emulated CommerceKit entry points through the
// Apple setup key exchange and per-request signing. The machine driver can be
// the in-process SapMachine (tests) or a Web Worker proxy (production); setup
// network calls run on the caller's thread so they ride the wisp tunnel.

import {
  validateSapSignerOptions,
  type SapSignerOptions,
} from "./types";

export interface SapMachineDriver {
  initialize(hardwareID: Uint8Array): Promise<number>;
  exchange(
    version: number,
    hardwareID: Uint8Array,
    contextValue: number,
    input: Uint8Array,
  ): Promise<{ output: Uint8Array; state: number }>;
  sign(contextValue: number, input: Uint8Array): Promise<Uint8Array>;
  teardown(contextValue: number): Promise<void>;
  close(): Promise<void>;
}

export interface SapSignerNetwork {
  fetchCertificate: () => Promise<Uint8Array>;
  exchange: (input: Uint8Array) => Promise<Uint8Array>;
}

export class SapSigner {
  private closed = false;

  private constructor(
    private readonly driver: SapMachineDriver,
    private readonly context: number,
  ) {}

  /**
   * Completes the Apple key exchange: initialize -> GET certificate ->
   * exchange(state 1) -> POST setup -> exchange(state 0).
   */
  static async create(
    options: SapSignerOptions,
    driver: SapMachineDriver,
    network: SapSignerNetwork,
  ): Promise<SapSigner> {
    validateSapSignerOptions(options);

    let context = 0;
    try {
      context = await driver.initialize(options.hardwareID);

      const certificate = await network.fetchCertificate();
      const first = await driver.exchange(
        options.version,
        options.hardwareID,
        context,
        certificate,
      );
      if (first.state !== 1) {
        throw new Error(`SAP setup entered unexpected state ${first.state}`);
      }
      if (first.output.length === 0) {
        throw new Error("SAP setup message is empty");
      }

      const reply = await network.exchange(first.output);
      const second = await driver.exchange(
        options.version,
        options.hardwareID,
        context,
        reply,
      );
      if (second.state !== 0) {
        throw new Error(
          `SAP setup completed in unexpected state ${second.state}`,
        );
      }
    } catch (error) {
      await driver.close().catch(() => undefined);
      throw error;
    }

    return new SapSigner(driver, context);
  }

  /** Signs request-body bytes; returns the X-Apple-ActionSignature value. */
  async sign(input: Uint8Array): Promise<string> {
    if (this.closed) {
      throw new Error("SAP signer is closed");
    }
    const signature = await this.driver.sign(this.context, input);
    if (signature.length === 0) {
      throw new Error("SAP signing produced an empty signature");
    }
    return bytesToBase64(signature);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.driver.teardown(this.context);
    } finally {
      await this.driver.close();
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}
