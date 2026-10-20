import i18n from '../i18n';
import { downloadProduct, DownloadError } from './downloadProduct';
import { buildPlist } from './plist';
import type { Account, Software, DownloadOutput, Sinf } from '../types';

export { DownloadError } from './downloadProduct';

export async function getDownloadInfo(
  account: Account,
  app: Software,
  externalVersionId?: string,
): Promise<{ output: DownloadOutput; updatedCookies: typeof account.cookies }> {
  const { dict, updatedCookies } = await downloadProduct(
    account,
    app,
    externalVersionId,
  );
  const item = dict.songList[0];
  const url = item.URL as string;
  if (!url) throw new DownloadError(i18n.t('errors.download.missingUrl'));
  const metadata = item.metadata as Record<string, any>;
  if (!metadata)
    throw new DownloadError(i18n.t('errors.download.missingMetadata'));
  const version = metadata.bundleShortVersionString as string;
  const bundleVersion = metadata.bundleVersion as string;
  if (!version || !bundleVersion)
    throw new DownloadError(i18n.t('errors.download.missingVersion'));

  const sinfs: Sinf[] = [];
  for (const sinfItem of (item.sinfs ?? []) as Record<string, any>[]) {
    const { id, sinf } = sinfItem;
    if (id === undefined || !sinf) continue;
    let sinfBase64: string;
    if (sinf instanceof Uint8Array || sinf instanceof ArrayBuffer) {
      sinfBase64 = base64FromBytes(
        sinf instanceof ArrayBuffer ? new Uint8Array(sinf) : sinf,
      );
    } else if (typeof sinf === 'string') {
      sinfBase64 = sinf;
    } else {
      throw new DownloadError(i18n.t('errors.download.invalidSinf'));
    }
    sinfs.push({ id, sinf: sinfBase64 });
  }
  if (!sinfs.length) throw new DownloadError(i18n.t('errors.download.noSinf'));

  const metadataDict: Record<string, any> = {
    ...metadata,
    'apple-id': account.email,
    userName: account.email,
  };
  delete metadataDict.passwordToken;
  const iTunesMetadata = base64FromBytes(
    new TextEncoder().encode(buildPlist(metadataDict)),
  );
  return {
    output: {
      downloadURL: url,
      sinfs,
      bundleShortVersionString: version,
      bundleVersion,
      iTunesMetadata,
    },
    updatedCookies,
  };
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
