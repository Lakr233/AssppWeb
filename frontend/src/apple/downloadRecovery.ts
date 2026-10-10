import { fetchBag } from './bag';
import { parsePlist } from './plist';
import type { StoreDownloadEndpoint } from './config';
import type { AppleResponse } from './request';

// Never include bodies, query parameters or account/session values in errors.
export function parseDownloadResponse(response: AppleResponse, host: string, path: string): Record<string, any> {
  try {
    const dict = parsePlist(response.body);
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) throw new Error('Not a dictionary');
    return dict;
  } catch {
    const kind = response.body.trim() ? 'invalid plist' : 'empty response';
    throw new Error(`Apple download: HTTP ${response.status}; ${kind}; ${host}${path.split('?')[0]}`);
  }
}

// Match ipatool's narrow updateProduct recovery. Do not retry other account
// messages, structured failures, arbitrary HTML errors, or silent empty lists.
export async function recoverUpdateEndpoint(
  response: AppleResponse,
  dict: Record<string, any> | undefined,
  deviceId: string,
): Promise<StoreDownloadEndpoint | undefined> {
  const empty500 = response.status === 500 && !response.body.trim();
  const message = typeof dict?.customerMessage === 'string' ? dict.customerMessage.trim().toLowerCase() : '';
  const unavailable = response.status === 200 && dict && !dict.failureType &&
    (!Array.isArray(dict.songList) || dict.songList.length === 0) &&
    (message === 'no longer available' || message.endsWith(' no longer available'));
  if (!empty500 && !unavailable) return undefined;

  const bag = await fetchBag(deviceId);
  if (!bag.updateURL) return undefined;
  let url: URL;
  try { url = new URL(bag.updateURL); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.host !== 'downloaddispatch.itunes.apple.com' ||
      url.pathname !== '/up/updateProduct' || url.search || url.hash || url.username || url.password ||
      bag.updateURL !== 'https://downloaddispatch.itunes.apple.com/up/updateProduct') return undefined;
  url.searchParams.set('guid', deviceId);
  return { host: url.hostname, path: url.pathname + url.search, externalVersionIdKey: 'appExtVrsId' };
}
