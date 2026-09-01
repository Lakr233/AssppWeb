// The SAP setup protocol.
//
// Ported from ipatool's internal/sap/signer_local.go and protocol.go. Setting
// up a signer takes two round trips to Apple and no credentials at all: the
// only identity involved is the device's hardware id, which is the same guid
// the rest of the client already sends in the clear.
//
// Once setup completes, signing is entirely local.

import { buildPlist } from "../plist";
import { Machine, type AssetBundle } from "./machine";

const SETUP_CERTIFICATE_KEY = "sign-sap-setup-cert";
const SETUP_BUFFER_KEY = "sign-sap-setup-buffer";
const MAX_SETUP_BODY = 1 << 20;
const SUPPORTED_VERSION = 200;

const USER_AGENT =
  "Configurator/2.17 (Macintosh; OS X 15.2; 24C5089c) AppleWebKit/0620.1.16.11.6";

export interface SapConfig {
  /** Bag key sign-sap-setup. */
  setupURL: string;
  /** Bag key sign-sap-setup-cert. */
  certificateURL: string;
  /** Bag key sign-sap-version; only 200 is implemented. */
  version: number;
  hardwareID: Uint8Array;
}

/**
 * How the setup exchange reaches Apple. The browser has to tunnel it, and
 * Node can use fetch directly, so the caller supplies it.
 */
export type Transport = (request: {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}) => Promise<Uint8Array>;

function validate(config: SapConfig): void {
  if (config.version !== SUPPORTED_VERSION) {
    throw new Error(`unsupported SAP version ${config.version}`);
  }
  if (config.hardwareID.length === 0 || config.hardwareID.length > 20) {
    throw new Error("SAP hardware ID must contain between 1 and 20 bytes");
  }
  // The endpoints come from the bag, so they are checked rather than trusted.
  // Our own origin is allowed whatever scheme it is served over, since these
  // requests are proxied through it and a plain-http origin is a development
  // setup, not a downgrade of an Apple endpoint.
  const origin =
    typeof self !== "undefined" && self.location ? self.location.origin : null;

  for (const [label, value] of [
    ["setup", config.setupURL],
    ["certificate", config.certificateURL],
  ] as const) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`SAP ${label} URL must be absolute`);
    }
    if (!url.host || url.username) {
      throw new Error(`SAP ${label} URL must be absolute`);
    }
    if (url.protocol !== "https:" && url.origin !== origin) {
      throw new Error(`SAP ${label} URL must use HTTPS`);
    }
  }
}

/**
 * Pulls one data value out of an Apple plist.
 *
 * plist.ts parses with DOMParser, which a worker does not have, and the setup
 * plists are a single key holding a single base64 blob — so this reads that
 * shape directly rather than pulling in an XML parser.
 */
function plistBytes(document: Uint8Array, key: string): Uint8Array {
  if (document.length > MAX_SETUP_BODY) {
    throw new Error(`Apple response exceeds ${MAX_SETUP_BODY} bytes`);
  }

  const xml = new TextDecoder().decode(document);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<key>\\s*${escaped}\\s*</key>\\s*<data>([\\s\\S]*?)</data>`,
  ).exec(xml);

  if (!match) throw new Error(`Apple plist is missing ${key}`);

  const binary = atob(match[1].replace(/\s+/g, ""));
  if (binary.length === 0) throw new Error(`Apple plist is missing ${key}`);

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export class Signer {
  private readonly machine: Machine;
  private readonly context: bigint;
  private readonly hardwareID: Uint8Array;
  private closed = false;

  private constructor(machine: Machine, context: bigint, hardwareID: Uint8Array) {
    this.machine = machine;
    this.context = context;
    this.hardwareID = hardwareID;
  }

  static async create(
    bundle: AssetBundle,
    config: SapConfig,
    transport: Transport,
  ): Promise<Signer> {
    validate(config);

    const machine = await Machine.open(bundle);
    let complete = false;

    try {
      const context = machine.initialize(config.hardwareID);

      const certificate = plistBytes(
        await transport({
          method: "GET",
          url: config.certificateURL,
          headers: { "User-Agent": USER_AGENT },
        }),
        SETUP_CERTIFICATE_KEY,
      );

      const first = machine.exchange(
        config.version,
        config.hardwareID,
        context,
        certificate,
      );
      if (first.state !== 1) {
        throw new Error(`SAP setup entered unexpected state ${first.state}`);
      }
      if (first.output.length === 0) {
        throw new Error("SAP setup message is empty");
      }

      const reply = plistBytes(
        await transport({
          method: "POST",
          url: config.setupURL,
          headers: {
            "Content-Type": "application/x-plist",
            "User-Agent": USER_AGENT,
          },
          body: new TextEncoder().encode(
            buildPlist({ [SETUP_BUFFER_KEY]: first.output }),
          ),
        }),
        SETUP_BUFFER_KEY,
      );

      const second = machine.exchange(
        config.version,
        config.hardwareID,
        context,
        reply,
      );
      if (second.state !== 0) {
        throw new Error(`SAP setup completed in unexpected state ${second.state}`);
      }

      complete = true;
      return new Signer(machine, context, config.hardwareID);
    } finally {
      if (!complete) machine.close();
    }
  }

  /** Signs a request payload. Local, with no network involved. */
  sign(payload: Uint8Array): Uint8Array {
    if (this.closed) throw new Error("SAP signer is closed");

    const signature = this.machine.sign(this.context, payload);
    if (signature.length === 0) {
      throw new Error("sign Apple request: signature is empty");
    }

    return signature;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    try {
      this.machine.teardown(this.context);
    } finally {
      this.machine.close();
      this.hardwareID.fill(0);
    }
  }
}
