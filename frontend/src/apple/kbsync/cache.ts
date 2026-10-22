// Per account/device kbsync cache, kept apart from Account so a token refresh
// does not overwrite it. Blobs are stored when generated so a background
// prefetch can serve the first download; a blob Apple rejects is replaced once.
// Bump the key when the StoreAgent profile or format changes.

const CACHE_PREFIX = 'asspp-kbsync-v1';

function key(dsid: number, deviceIdentifier: string): string {
  return `${CACHE_PREFIX}:${dsid}:${deviceIdentifier.toLowerCase()}`;
}

export function cachedKBSync(dsid: number, deviceIdentifier: string): string | undefined {
  try {
    return localStorage.getItem(key(dsid, deviceIdentifier)) || undefined;
  } catch {
    return undefined;
  }
}

export function storeKBSync(dsid: number, deviceIdentifier: string, kbsync: string): void {
  try {
    localStorage.setItem(key(dsid, deviceIdentifier), kbsync);
  } catch {
    // Best effort: an unavailable store must not fail a successful download.
  }
}

export function invalidateKBSync(dsid: number, deviceIdentifier: string, kbsync: string): void {
  try {
    if (localStorage.getItem(key(dsid, deviceIdentifier)) === kbsync) {
      localStorage.removeItem(key(dsid, deviceIdentifier));
    }
  } catch {
    // ignore
  }
}
