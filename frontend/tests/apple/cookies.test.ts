import { describe, it, expect } from 'vitest';
import { mergeCookies, buildCookieHeader, parseCookieHeaders } from '../../src/apple/cookies';
import type { Cookie } from '../../src/types';

function makeCookie(overrides: Partial<Cookie> = {}): Cookie {
  return {
    name: 'test',
    value: 'value',
    path: '/',
    httpOnly: false,
    secure: false,
    ...overrides,
  };
}

describe('apple/cookies', () => {
  describe('mergeCookies', () => {
    it('should merge cookies by name', () => {
      const existing = [makeCookie({ name: 'a', value: '1' })];
      const incoming = [makeCookie({ name: 'b', value: '2' })];

      const result = mergeCookies(existing, incoming);
      expect(result).toHaveLength(2);
      expect(result.find((c) => c.name === 'a')?.value).toBe('1');
      expect(result.find((c) => c.name === 'b')?.value).toBe('2');
    });

    it('should override existing cookies with same name', () => {
      const existing = [makeCookie({ name: 'token', value: 'old' })];
      const incoming = [makeCookie({ name: 'token', value: 'new' })];

      const result = mergeCookies(existing, incoming);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('new');
    });

    it('should handle empty arrays', () => {
      expect(mergeCookies([], [])).toHaveLength(0);
      expect(mergeCookies([makeCookie()], [])).toHaveLength(1);
      expect(mergeCookies([], [makeCookie()])).toHaveLength(1);
    });
  });

  describe('buildCookieHeader', () => {
    it('should build cookie header string', () => {
      const cookies = [makeCookie({ name: 'a', value: '1' }), makeCookie({ name: 'b', value: '2' })];

      const header = buildCookieHeader(cookies, 'https://example.com/path');
      expect(header).toContain('a=1');
      expect(header).toContain('b=2');
      expect(header).toContain('; ');
    });

    it('should filter by domain', () => {
      const cookies = [
        makeCookie({ name: 'valid', value: '1', domain: 'example.com' }),
        makeCookie({ name: 'invalid', value: '2', domain: 'other.com' }),
      ];

      const header = buildCookieHeader(cookies, 'https://example.com/');
      expect(header).toContain('valid=1');
      expect(header).not.toContain('invalid=2');
    });

    it('should match subdomains', () => {
      const cookies = [makeCookie({ name: 'sub', value: '1', domain: 'example.com' })];

      const header = buildCookieHeader(cookies, 'https://buy.example.com/');
      expect(header).toContain('sub=1');
    });

    it('should filter by path', () => {
      const cookies = [
        makeCookie({ name: 'root', value: '1', path: '/' }),
        makeCookie({ name: 'api', value: '2', path: '/api' }),
      ];

      const header = buildCookieHeader(cookies, 'https://example.com/other');
      expect(header).toContain('root=1');
      expect(header).not.toContain('api=2');
    });

    it('should filter expired cookies', () => {
      const cookies = [
        makeCookie({ name: 'expired', value: '1', expiresAt: 1000 }),
        makeCookie({ name: 'valid', value: '2' }),
      ];

      const header = buildCookieHeader(cookies, 'https://example.com/');
      expect(header).not.toContain('expired=1');
      expect(header).toContain('valid=2');
    });

    it('should filter secure cookies for http URLs', () => {
      const cookies = [
        makeCookie({ name: 'secure', value: '1', secure: true }),
        makeCookie({ name: 'normal', value: '2' }),
      ];

      const header = buildCookieHeader(cookies, 'http://example.com/');
      expect(header).not.toContain('secure=1');
      expect(header).toContain('normal=2');
    });

    it('should include secure cookies for https URLs', () => {
      const cookies = [makeCookie({ name: 'secure', value: '1', secure: true })];

      const header = buildCookieHeader(cookies, 'https://example.com/');
      expect(header).toContain('secure=1');
    });

    it('should skip cookies with empty name or value', () => {
      const cookies = [
        makeCookie({ name: '', value: '1' }),
        makeCookie({ name: 'valid', value: '' }),
        makeCookie({ name: 'ok', value: 'ok' }),
      ];

      const header = buildCookieHeader(cookies, 'https://example.com/');
      expect(header).toBe('ok=ok');
    });

    it('should return empty string for invalid URL', () => {
      const cookies = [makeCookie()];
      const header = buildCookieHeader(cookies, 'not-a-url');
      expect(header).toBe('');
    });
  });

  describe('parseCookieHeaders', () => {
    it('should parse basic Set-Cookie header', () => {
      const result = parseCookieHeaders(['session=abc123; Path=/; HttpOnly']);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('session');
      expect(result[0].value).toBe('abc123');
      expect(result[0].path).toBe('/');
      expect(result[0].httpOnly).toBe(true);
    });

    it('should parse domain attribute', () => {
      const result = parseCookieHeaders(['token=xyz; Domain=.apple.com; Secure']);
      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('apple.com'); // leading dot stripped
      expect(result[0].secure).toBe(true);
    });

    it('should parse max-age attribute', () => {
      const result = parseCookieHeaders(['temp=val; Max-Age=3600']);
      expect(result).toHaveLength(1);
      expect(result[0].expiresAt).toBeDefined();
      expect(result[0].expiresAt!).toBeGreaterThan(Date.now() / 1000);
    });

    it('should parse expires attribute', () => {
      const result = parseCookieHeaders(['old=val; Expires=Thu, 01 Jan 2099 00:00:00 GMT']);
      expect(result).toHaveLength(1);
      expect(result[0].expiresAt).toBeDefined();
    });

    it('should handle multiple Set-Cookie headers', () => {
      const result = parseCookieHeaders(['a=1; Path=/', 'b=2; Path=/api; Secure']);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('a');
      expect(result[1].name).toBe('b');
    });

    it('should handle values containing equals signs', () => {
      const result = parseCookieHeaders(['data=base64==encoded; Path=/']);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('data');
      expect(result[0].value).toBe('base64==encoded');
    });
  });
});
