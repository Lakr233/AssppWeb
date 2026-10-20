import { describe, it, expect } from 'vitest';
import { compareVersions, isNewerVersion } from '../../src/utils/version';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('5.1', '5.1')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('treats missing segments as 0', () => {
    expect(compareVersions('5', '5.0')).toBe(0);
    expect(compareVersions('5', '5.0.0')).toBe(0);
    expect(compareVersions('5.0', '5.0.0')).toBe(0);
  });

  it('returns positive when a > b', () => {
    expect(compareVersions('5.1', '5')).toBeGreaterThan(0);
    expect(compareVersions('5.1', '5.0')).toBeGreaterThan(0);
    expect(compareVersions('6', '5.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareVersions('5', '5.1')).toBeLessThan(0);
    expect(compareVersions('5.0', '5.1')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  });
});

describe('isNewerVersion', () => {
  it('returns false when versions are equal', () => {
    expect(isNewerVersion('5', '5')).toBe(false);
    expect(isNewerVersion('5.1', '5.1')).toBe(false);
  });

  it('returns false when latest is older (issue #60 case)', () => {
    // iTunes reports "5" but installed is "5.1" — no update
    expect(isNewerVersion('5', '5.1')).toBe(false);
  });

  it('returns false when latest equals current with different padding', () => {
    expect(isNewerVersion('5', '5.0')).toBe(false);
    expect(isNewerVersion('5.0', '5.0.0')).toBe(false);
  });

  it('returns true when latest is genuinely newer', () => {
    expect(isNewerVersion('5.2', '5.1')).toBe(true);
    expect(isNewerVersion('6', '5.1')).toBe(true);
    expect(isNewerVersion('6.0', '5.9.9')).toBe(true);
  });
});
