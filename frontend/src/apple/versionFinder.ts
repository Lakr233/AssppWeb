import { downloadProduct } from './downloadProduct';
import type { Account, Software } from '../types';

export async function listVersions(
  account: Account,
  app: Software,
): Promise<{ versions: string[]; updatedCookies: typeof account.cookies }> {
  const { dict, updatedCookies } = await downloadProduct(account, app);
  const identifiers =
    dict.songList[0].metadata?.softwareVersionExternalIdentifiers;
  if (!Array.isArray(identifiers))
    throw new Error('Missing version identifiers');
  const versions = identifiers.map(String).reverse();
  if (!versions.length) throw new Error('No versions found');
  return { versions, updatedCookies };
}
