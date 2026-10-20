/**
 * Compare two dot-separated version strings numerically.
 * Missing segments are treated as 0 (e.g., "5" == "5.0" == "5.0.0").
 *
 * Returns:
 *   positive if a > b
 *   negative if a < b
 *   0        if a == b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((s) => parseInt(s, 10) || 0);
  const partsB = b.split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

/** Returns true when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
