// kbsync generation for the bag's ent/download endpoint. Ported from ipatool's
// internal/sap/machine/storeagent.go and kbsync.go (majd/ipatool@3411d57), which
// pin the same OS X 10.9 StoreAgent image and entry offsets.

import { GuestMachine, hardwareBlock, toInt32 } from './machine';
import type { KBSyncAssets } from './types';

const STORE_AGENT_BASE = 0x00001000c0000000;
const STORE_AGENT_GLOBAL_INIT = STORE_AGENT_BASE + 0x0c5fc0;
const STORE_AGENT_KBSYNC_ENTRY = STORE_AGENT_BASE + 0x0c93c0;
const STORE_AGENT_SC_INFO_PATH = '/Users/Shared/SC Info';
const STORE_AGENT_DISPOSE = '_jEHf8Xzsv8K';

const STORE_AGENT_ZERO_RETURN_ALIASES = [
  '_pthread_rwlock_rdlock',
  '_pthread_rwlock_rdlock$UNIX2003',
  '_pthread_mutex_init',
  '_pthread_mutex_destroy',
  '_pthread_rwlock_destroy',
];

// Global initialization can exceed ipatool's one-minute guest bound on slower
// hosts (majd/ipatool#631), and WebAssembly is slower than native Unicorn.
const STORE_AGENT_TIMEOUT_US = 5 * 60 * 1000 * 1000;

/** Creates the account- and hardware-bound FairPlay data for ent/download. */
export async function generateKBSync(
  assets: KBSyncAssets,
  hardwareID: Uint8Array,
  dsid: number,
  options: { wasmBinary?: ArrayBuffer } = {},
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(dsid) || dsid <= 0) {
    throw new Error('kbsync requires a nonzero account DSID');
  }
  const hardware = hardwareBlock(hardwareID);

  const { machine, exports } = await GuestMachine.open(assets, {
    extraImages: [{ name: 'storeagent', data: assets.storeAgent, base: STORE_AGENT_BASE }],
    zeroReturnAliases: STORE_AGENT_ZERO_RETURN_ALIASES,
    wasmBinary: options.wasmBinary,
  });
  try {
    machine.dispose = exports.get(STORE_AGENT_DISPOSE) ?? 0;
    const globalContext = initializeGlobal(machine, hardware);
    return createKBSync(machine, globalContext, dsid);
  } finally {
    machine.close();
  }
}

function initializeGlobal(machine: GuestMachine, hardware: Uint8Array): number {
  machine.beginCall();
  try {
    const hardwareAddress = machine.scratch(hardware);
    const pathAddress = machine.scratch(new TextEncoder().encode(`${STORE_AGENT_SC_INFO_PATH}\0`));
    const contextField = machine.scratch(4);
    const status = machine.invoke(
      STORE_AGENT_GLOBAL_INIT,
      [0, hardwareAddress, pathAddress, contextField],
      STORE_AGENT_TIMEOUT_US,
    );
    if (toInt32(status) !== 0) {
      throw new Error(`StoreAgent global initialization returned ${toInt32(status)}`);
    }
    const value = machine.readUint32(contextField);
    if (value === 0) {
      throw new Error('StoreAgent global initialization returned a null context');
    }
    return value;
  } finally {
    machine.clearScratch();
  }
}

function createKBSync(machine: GuestMachine, globalContext: number, dsid: number): Uint8Array {
  machine.beginCall();
  try {
    const pointerField = machine.scratch(8);
    // StoreAgent writes a uint32 length. The zeroed upper half lets the shared
    // output reader apply its bounds checks and dispose the buffer.
    const lengthField = machine.scratch(8);
    const status = machine.invoke(
      STORE_AGENT_KBSYNC_ENTRY,
      [globalContext, dsid, 0, 1, pointerField, lengthField],
      STORE_AGENT_TIMEOUT_US,
    );
    let output: Uint8Array;
    try {
      output = machine.consumeOutput(pointerField, lengthField);
    } catch (error) {
      if (toInt32(status) !== 0) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`StoreAgent kbsync returned ${toInt32(status)}: ${reason}`);
      }
      throw error;
    }
    if (toInt32(status) !== 0) {
      throw new Error(`StoreAgent kbsync returned ${toInt32(status)}`);
    }
    if (output.length === 0) {
      throw new Error('StoreAgent kbsync returned an empty buffer');
    }
    return output;
  } finally {
    machine.clearScratch();
  }
}
