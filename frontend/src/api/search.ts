import { apiGet } from './client';
import type { Software } from '../types';

export async function searchApps(
  term: string,
  country: string,
  entity: string,
  limit: number = 25,
): Promise<Software[]> {
  const params = new URLSearchParams({
    term,
    country,
    entity: entity === 'iPad' ? 'iPadSoftware' : 'software',
    limit: String(limit),
  });
  return apiGet<Software[]>(`/api/search?${params}`);
}

export async function lookupApp(bundleId: string, country: string): Promise<Software | null> {
  const params = new URLSearchParams({ bundleId, country });
  return apiGet<Software | null>(`/api/lookup?${params}`);
}
