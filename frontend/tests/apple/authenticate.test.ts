import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlist } from "../../src/apple/plist";
import { authenticate } from "../../src/apple/authenticate";
import { appleRequest } from "../../src/apple/request";
import { fetchBag } from "../../src/apple/bag";

vi.mock("../../src/apple/request", () => ({
  appleRequest: vi.fn(),
}));

vi.mock("../../src/apple/bag", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/apple/bag")>(),
  fetchBag: vi.fn(),
  defaultAuthURL:
    "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate",
}));

describe("apple/authenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets guid query exactly once from bag endpoint", async () => {
    vi.mocked(fetchBag).mockResolvedValue({
      authURL:
        "https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate?foo=1&guid=old-value",
    });
    vi.mocked(appleRequest).mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      rawHeaders: [],
      body: buildPlist({
        accountInfo: {
          appleId: "test@example.com",
          address: {
            firstName: "Test",
            lastName: "User",
          },
        },
        passwordToken: "token",
        dsPersonId: "123",
      }),
    });

    await authenticate(
      "test@example.com",
      "password",
      undefined,
      undefined,
      "aabbccddeeff",
    );

    const requestCall = vi.mocked(appleRequest).mock.calls[0][0];
    const endpoint = new URL(`https://${requestCall.host}${requestCall.path}`);

    expect(endpoint.pathname).toBe("/WebObjects/MZFinance.woa/wa/authenticate/");
    expect(endpoint.searchParams.get("guid")).toBe("aabbccddeeff");
    expect(endpoint.searchParams.getAll("guid")).toHaveLength(1);
    expect(endpoint.searchParams.get("foo")).toBe("1");
  });
  it.each([301, 302, 303, 307, 308])('normalizes a relative legacy redirect (%s) and preserves its query', async (status) => {
    vi.mocked(fetchBag).mockResolvedValue({
      authURL: 'https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate',
    });
    vi.mocked(appleRequest).mockResolvedValueOnce({
      status,
      statusText: 'Redirect',
      headers: { location: '/WebObjects/MZFinance.woa/wa/authenticate?routing=a%2Fb&guid=aabbccddeeff' },
      rawHeaders: [],
      body: '',
    }).mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      rawHeaders: [],
      body: buildPlist({
        accountInfo: { appleId: 'test@example.com', address: { firstName: 'Test', lastName: 'User' } },
        passwordToken: 'token',
        dsPersonId: '123',
      }),
    });

    await authenticate('test@example.com', 'password', undefined, undefined, 'aabbccddeeff');

    expect(appleRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(appleRequest).mock.calls[1][0]).toMatchObject({
      host: 'p25-buy.itunes.apple.com',
      path: '/WebObjects/MZFinance.woa/wa/authenticate/?routing=a%2Fb&guid=aabbccddeeff',
    });
  });

});
