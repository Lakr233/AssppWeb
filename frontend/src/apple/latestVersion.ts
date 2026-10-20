import { appleRequest } from './request';
import { storeIdToCountry } from './config';
import type { Account, Software } from '../types';

// Public MDM catalog, as used by ipatool's iOS redownload recovery. Never send
// the account's cookies, DSID or password token to this metadata endpoint.
export async function lookupLatestVersion(account: Account, app: Software): Promise<string> {
  const country = storeIdToCountry(account.store.split('-')[0]);
  if (!country) throw new Error('Unknown account storefront');

  for (const platform of ['enterprisestore', 'iphone', 'ipad']) {
    const query = new URLSearchParams({
      version: '2', id: String(app.id), p: 'mdm-lockup', caller: 'MDM',
      platform, cc: country.toLowerCase(), l: 'en',
    });
    const response = await appleRequest({
      method: 'GET', host: 'uclient-api.itunes.apple.com',
      path: `/WebObjects/MZStorePlatform.woa/wa/lookup?${query}`,
    });
    if (response.status !== 200) throw new Error(`Catalog HTTP ${response.status}`);
    const item = JSON.parse(response.body).results?.[String(app.id)];
    if (!item || !Array.isArray(item.offers) || !item.offers.length) continue;
    if (app.bundleID && item.bundleId !== app.bundleID) {
      throw new Error('Catalog returned a different bundle identifier');
    }
    const offer = item.offers[0];
    const version = String(offer.version?.externalId ??
      new URLSearchParams(offer.buyParams ?? '').get('appExtVrsId') ?? '');
    if (/^[1-9]\d*$/.test(version)) return version;
    throw new Error('Catalog returned no valid iOS version identifier');
  }
  throw new Error('App not found in account storefront catalogs');
}
