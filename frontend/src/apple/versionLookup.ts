import { downloadProduct } from './downloadProduct';
import type { Account, Software, VersionMetadata } from '../types';

export async function getVersionMetadata(
  account: Account,
  app: Software,
  versionId: string,
): Promise<{
  metadata: VersionMetadata;
  updatedCookies: typeof account.cookies;
}> {
  const { dict, updatedCookies } = await downloadProduct(
    account,
    app,
    versionId,
  );
  const metadata = dict.songList[0].metadata;
  if (!metadata?.bundleShortVersionString)
    throw new Error('Missing bundleShortVersionString');
  if (!metadata.releaseDate) throw new Error('Missing releaseDate');
  return {
    metadata: {
      displayVersion: metadata.bundleShortVersionString,
      releaseDate:
        metadata.releaseDate instanceof Date
          ? metadata.releaseDate.toISOString()
          : String(metadata.releaseDate),
    },
    updatedCookies,
  };
}
