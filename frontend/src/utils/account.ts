import { storeIdToCountry } from '../apple/config';
import type { Account } from '../types';

function normalizeStorefront(store?: string): string | undefined {
  if (!store) return undefined;
  const [storeId] = store.split('-');
  return storeId || undefined;
}

export function accountStoreCountry(account?: Account | null): string | undefined {
  const storeId = normalizeStorefront(account?.store);
  if (!storeId) return undefined;
  return storeIdToCountry(storeId);
}

export function firstAccountCountry(accounts: Account[]): string | undefined {
  for (const account of accounts) {
    const country = accountStoreCountry(account);
    if (country) return country;
  }
  return undefined;
}

export async function accountHash(account: Account): Promise<string> {
  const source = account.directoryServicesIdentifier || account.appleId || account.email;
  return sha256Hex(source);
}

async function sha256Hex(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(digest));
  }

  return fnv1a64Hex(value);
}

function fnv1a64Hex(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
