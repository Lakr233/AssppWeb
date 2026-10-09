import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlist } from "../../src/apple/plist";
import {
  defaultAuthURL,
  fetchBag,
  normalizeAuthURL,
} from "../../src/apple/bag";

describe("apple/bag", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses authenticateAccount from urlBag", async () => {
    const xml = buildPlist({
      urlBag: {
        authenticateAccount:
          "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(result.authURL).toBe(
      "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate/",
    );
  });

  it("normalizes a native auth endpoint at the plist root to the /fast/ path", async () => {
    const xml = buildPlist({
      authenticateAccount: "https://auth.itunes.apple.com/auth/v1/native",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(result.authURL).toBe(
      "https://auth.itunes.apple.com/auth/v1/native/fast/",
    );
  });

  it("falls back when authenticateAccount is missing", async () => {
    const xml = buildPlist({
      urlBag: {
        Ghostrider: "YES",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => xml,
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(result.authURL).toBe(defaultAuthURL);
  });

  it("falls back when bag proxy returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ error: "upstream failed" }),
      }),
    );

    const result = await fetchBag("aabbccddeeff");

    expect(result.authURL).toBe(defaultAuthURL);
  });

  describe("normalizeAuthURL", () => {
    it("appends /fast/ to a bare native auth endpoint", () => {
      expect(
        normalizeAuthURL("https://auth.itunes.apple.com/auth/v1/native"),
      ).toBe("https://auth.itunes.apple.com/auth/v1/native/fast/");
    });

    it("adds the trailing slash when /fast is already present", () => {
      expect(
        normalizeAuthURL("https://auth.itunes.apple.com/auth/v1/native/fast"),
      ).toBe("https://auth.itunes.apple.com/auth/v1/native/fast/");
    });

    it("is idempotent on an already-normalized endpoint", () => {
      expect(
        normalizeAuthURL("https://auth.itunes.apple.com/auth/v1/native/fast/"),
      ).toBe("https://auth.itunes.apple.com/auth/v1/native/fast/");
    });

    it.each(['buy.itunes.apple.com', 'p25-buy.itunes.apple.com'])('normalizes the legacy path on %s without losing opaque queries', (host) => {
      const legacy = `https://${host}/WebObjects/MZFinance.woa/wa/authenticate?routing=opaque&guid=aabbccddeeff`;
      const normalized = `https://${host}/WebObjects/MZFinance.woa/wa/authenticate/?routing=opaque&guid=aabbccddeeff`;
      expect(normalizeAuthURL(legacy)).toBe(normalized);
      expect(normalizeAuthURL(normalized)).toBe(normalized);
    });

    it('does not rewrite unrelated paths or hosts', () => {
      for (const endpoint of [
        'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/purchase',
        'https://example.invalid/WebObjects/MZFinance.woa/wa/authenticate',
      ]) {
        expect(normalizeAuthURL(endpoint)).toBe(endpoint);
      }
    });
  });
});
