import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Authenticator } from '../../src/apple/authenticate';
import { fetchBag } from '../../src/apple/bag';
import { buildPlist, parsePlist } from '../../src/apple/plist';
import { appleRequest } from '../../src/apple/request';
import { connectSAP } from '../../src/apple/sap';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
vi.mock('../../src/apple/sap', () => ({ connectSAP: vi.fn() }));
vi.mock('../../src/apple/bag', async (original) => ({
  ...(await original<typeof import('../../src/apple/bag')>()),
  fetchBag: vi.fn(),
}));

const reply = (body: Record<string, unknown>, headers: Record<string, string> = {}, status = 200) => ({
  body: buildPlist(body),
  headers,
  status,
  statusText: '',
  rawHeaders: [] as [string, string][],
});
const success = {
  accountInfo: { appleId: 'synthetic@example.invalid', address: {} },
  passwordToken: 'test-token',
  dsPersonId: '123',
};

describe('SAP authentication integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchBag).mockResolvedValue({ authURL: 'https://auth.itunes.apple.com/auth/v1/native/fast/' });
  });

  it('signs the exact body for redirects and retains one signer, cookies and routing for verification', async () => {
    const sign = vi.fn(async () => Uint8Array.of(sign.mock.calls.length));
    vi.mocked(connectSAP).mockResolvedValue({ sign });
    vi.mocked(appleRequest)
      .mockResolvedValueOnce(
        reply(
          {},
          { location: 'https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate', pod: '25' },
          302,
        ),
      )
      .mockResolvedValueOnce({
        ...reply(
          { failureType: '', customerMessage: 'MZFinance.BadLogin.Configurator_message' },
          { 'x-set-apple-store-front': '143441-1' },
        ),
        rawHeaders: [['set-cookie', 'session=continued; Domain=.itunes.apple.com; Path=/; Secure']],
      })
      .mockResolvedValueOnce(reply(success));
    const authenticator = new Authenticator('aabbccddeeff');
    await expect(authenticator.authenticate('synthetic@example.invalid', 'password')).rejects.toMatchObject({
      codeRequired: true,
    });
    const account = await authenticator.authenticate('synthetic@example.invalid', 'password', '123456');
    expect(connectSAP).toHaveBeenCalledOnce();
    expect(account).toMatchObject({ store: '143441', pod: '25' });
    for (const [index, [request]] of vi.mocked(appleRequest).mock.calls.entries()) {
      expect(sign.mock.calls[index][0]).toEqual(new TextEncoder().encode(request.body));
      expect(request.headers?.['X-Apple-ActionSignature']).toBe(btoa(String.fromCharCode(index + 1)));
    }
    const continuation = vi.mocked(appleRequest).mock.calls[2][0];
    expect(continuation.host).toBe('p25-buy.itunes.apple.com');
    expect(continuation.cookies).toEqual([expect.objectContaining({ name: 'session', value: 'continued' })]);
    expect(parsePlist(continuation.body!)).toMatchObject({ password: 'password123456', attempt: '2' });
  });

  it('never sends credentials if SAP setup or signing fails', async () => {
    vi.mocked(connectSAP).mockRejectedValueOnce(new Error('SAP setup failed'));
    await expect(
      new Authenticator('aabbccddeeff').authenticate('synthetic@example.invalid', 'password'),
    ).rejects.toThrow('SAP setup failed');
    expect(appleRequest).not.toHaveBeenCalled();
    vi.mocked(connectSAP).mockResolvedValue({ sign: vi.fn().mockRejectedValue(new Error('SAP signing failed')) });
    await expect(
      new Authenticator('aabbccddeeff').authenticate('synthetic@example.invalid', 'password'),
    ).rejects.toThrow('SAP signing failed');
    expect(appleRequest).not.toHaveBeenCalled();
  });

  it('creates a fresh signature when retrying the same login body', async () => {
    vi.useFakeTimers();
    try {
      let signatures = 0;
      const sign = vi.fn(async () => Uint8Array.of(++signatures));
      vi.mocked(connectSAP).mockResolvedValue({ sign });
      vi.mocked(appleRequest)
        .mockResolvedValueOnce(reply({}, {}, 204))
        .mockResolvedValueOnce(reply(success));
      const pending = new Authenticator('aabbccddeeff').authenticate('synthetic@example.invalid', 'password');
      await vi.advanceTimersByTimeAsync(10000);
      await pending;
      const requests = vi.mocked(appleRequest).mock.calls.map(([request]) => request);
      expect(requests[0].body).toBe(requests[1].body);
      expect(requests[0].headers?.['X-Apple-ActionSignature']).not.toBe(
        requests[1].headers?.['X-Apple-ActionSignature'],
      );
      expect(sign).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an unapproved authentication destination before SAP setup', async () => {
    vi.mocked(fetchBag).mockResolvedValue({ authURL: 'https://example.invalid/authenticate' });
    await expect(
      new Authenticator('aabbccddeeff').authenticate('synthetic@example.invalid', 'password'),
    ).rejects.toThrow('approved Apple HTTPS');
    expect(connectSAP).not.toHaveBeenCalled();
    expect(appleRequest).not.toHaveBeenCalled();
  });
});
