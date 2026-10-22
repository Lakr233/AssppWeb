// kbsync for ent/download. Generation emulates StoreAgent and takes tens of
// seconds, so blobs are prepared in the background and shared between callers.

import { cachedKBSync, storeKBSync } from './cache';
import { generateKBSync } from './generate';
import type { Account } from '../../types';

export { hardwareIDFromDeviceIdentifier } from './generate';

const inFlight = new Map<string, Promise<string>>();
let prefetchQueue: Promise<void> = Promise.resolve();

/** Returns the cached kbsync, or generates and caches one, sharing in-flight work. */
export function obtainKBSync(deviceIdentifier: string, dsid: number): Promise<string> {
  const cached = cachedKBSync(dsid, deviceIdentifier);
  if (cached) {
    return Promise.resolve(cached);
  }
  const key = `${dsid}:${deviceIdentifier.toLowerCase()}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = generateKBSync(deviceIdentifier, dsid).then((kbsync) => {
      storeKBSync(dsid, deviceIdentifier, kbsync);
      return kbsync;
    });
    inFlight.set(key, pending);
    pending.then(
      () => inFlight.delete(key),
      () => inFlight.delete(key),
    );
  }
  return pending;
}

/** Generates missing kbsync blobs one account at a time, ahead of the first download. */
export function prefetchKBSync(accounts: Account[]): void {
  for (const account of accounts) {
    const dsid = Number(account.directoryServicesIdentifier);
    if (
      !Number.isSafeInteger(dsid) ||
      dsid <= 0 ||
      !/^[0-9a-f]{12}$/i.test(account.deviceIdentifier) ||
      cachedKBSync(dsid, account.deviceIdentifier)
    ) {
      continue;
    }
    prefetchQueue = prefetchQueue
      .then(() => obtainKBSync(account.deviceIdentifier, dsid))
      .then(
        () => undefined,
        (error) => console.warn(`[kbsync] Prefetch failed: ${error instanceof Error ? error.message : String(error)}`),
      );
  }
}
