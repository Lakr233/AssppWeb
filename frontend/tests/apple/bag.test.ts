import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlist } from "../../src/apple/plist";
import { defaultAuthURL, fetchBag } from "../../src/apple/bag";

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
      "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate",
    );
  });

  it("prefers the top-level authenticateAccount over urlBag", async () => {
    const xml = buildPlist({
      authenticateAccount:
        "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate",
      urlBag: {
        authenticateAccount: "https://example.com/should-not-be-used",
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
      "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate",
    );
  });

  it("appends /fast to auth.itunes.apple.com endpoints", async () => {
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
      "https://auth.itunes.apple.com/auth/v1/native/fast",
    );
  });

  it("does not double-append /fast when already present", async () => {
    const xml = buildPlist({
      authenticateAccount: "https://auth.itunes.apple.com/auth/v1/native/fast",
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
      "https://auth.itunes.apple.com/auth/v1/native/fast",
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
});
