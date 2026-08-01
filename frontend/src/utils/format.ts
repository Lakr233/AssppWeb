export function formatBytes(value?: number | string): string {
  if (value === undefined || value === null || value === '') return '—';

  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const amount = bytes / 1024 ** unitIndex;
  const digits = unitIndex === 0 || amount >= 100 ? 0 : 1;

  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}
