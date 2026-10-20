import { apiGet, apiPost, apiDelete } from './client';
import type { DownloadTask, Software, Sinf } from '../types';

export async function fetchDownloads(accountHashes: string[]): Promise<DownloadTask[]> {
  if (accountHashes.length === 0) return [];
  const params = new URLSearchParams({
    accountHashes: accountHashes.join(','),
  });
  return apiGet<DownloadTask[]>(`/api/downloads?${params}`);
}

export async function startDownload(data: {
  software: Software;
  accountHash: string;
  downloadURL: string;
  sinfs: Sinf[];
}): Promise<DownloadTask> {
  return apiPost<DownloadTask>('/api/downloads', data);
}

export async function pauseDownload(id: string, accountHash: string): Promise<void> {
  const params = new URLSearchParams({ accountHash });
  await apiPost(`/api/downloads/${id}/pause?${params}`);
}

export async function resumeDownload(id: string, accountHash: string): Promise<void> {
  const params = new URLSearchParams({ accountHash });
  await apiPost(`/api/downloads/${id}/resume?${params}`);
}

export async function deleteDownload(id: string, accountHash: string): Promise<void> {
  const params = new URLSearchParams({ accountHash });
  await apiDelete(`/api/downloads/${id}?${params}`);
}
