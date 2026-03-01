import { authHeaders } from './client';
import type { DownloadTask } from '../types';

interface UploadSignedIpaParams {
  ipaBlob: Blob;
  accountHash: string;
  bundleID: string;
  version?: string;
  name: string;
}

export async function uploadSignedIpa({
  ipaBlob,
  accountHash,
  bundleID,
  version = '1.0.0',
  name,
}: UploadSignedIpaParams): Promise<DownloadTask> {
  const params = new URLSearchParams({
    accountHash,
    bundleID,
    version,
    name,
  });

  const response = await fetch(`/api/signing/upload?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...authHeaders(),
    },
    body: ipaBlob,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
