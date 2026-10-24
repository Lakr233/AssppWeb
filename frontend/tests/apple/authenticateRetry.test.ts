import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import { buildPlist } from '../../src/apple/plist';
import { authenticate } from '../../src/apple/authenticate';
import { appleRequest } from '../../src/apple/request';
import { fetchBag } from '../../src/apple/bag';

vi.mock('../../src/apple/sap', () => ({
  connectSAP: vi.fn(async () => ({ sign: async () => Uint8Array.of(1, 2, 3) })),
}));

vi.mock('../../src/apple/request', () => ({
  appleRequest: vi.fn(),
}));

vi.mock('../../src/apple/bag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/apple/bag')>()),
  fetchBag: vi.fn(),
}));

describe('apple/authenticate transient responses', () => {
  const accountReply = () => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    rawHeaders: [],
    body: buildPlist({
      accountInfo: { address: {} },
      passwordToken: 'token',
      dsPersonId: '123',
    }),
  });
  const transientReply = (status: number, headers: Record<string, string> = {}) => ({
    status,
    statusText: '',
    headers,
    rawHeaders: [],
    body: '',
  });
  const login = (onRetry?: Parameters<typeof authenticate>[5]) =>
    authenticate('test@example.com', 'password', undefined, undefined, 'aabbccddeeff', onRetry);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fetchBag).mockResolvedValue({
      authURL: 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate/',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays a 204 after 2s and reports the wait', async () => {
    vi.mocked(appleRequest).mockResolvedValueOnce(transientReply(204)).mockResolvedValueOnce(accountReply());
    const onRetry = vi.fn();

    const account = login(onRetry);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(account).resolves.toMatchObject({ passwordToken: 'token' });
    expect(appleRequest).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({
      status: 204,
      attempt: 2,
      attempts: 8,
      delayMs: 2_000,
    });
  });

  it('gives up after the whole budget without stacking retries', async () => {
    vi.mocked(appleRequest).mockResolvedValue(transientReply(204));

    const account = login();
    const assertion = expect(account).rejects.toThrow(Array(8).fill('204').join(', '));
    await vi.advanceTimersByTimeAsync(30_000);

    await assertion;
    expect(appleRequest).toHaveBeenCalledTimes(8);
  });

  // Apple's edge sheds load per route, so a replay of the same endpoint draws
  // from the same pool. Each retry goes to the next candidate instead.
  it('rotates endpoints across retries', async () => {
    vi.mocked(appleRequest).mockResolvedValue(transientReply(204));

    const account = login();
    const assertion = expect(account).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;

    const targets = vi.mocked(appleRequest).mock.calls.map((call) => call[0].host);
    expect(targets.slice(0, 4)).toEqual([
      'buy.itunes.apple.com',
      'auth.itunes.apple.com',
      'buy.itunes.apple.com',
      'auth.itunes.apple.com',
    ]);
  });

  // A refusal that carries no Apple service header never reached the service
  // that checks credentials, which is different advice from a service that
  // answered badly.
  it('tells an edge refusal apart from a service answering badly', async () => {
    vi.mocked(appleRequest).mockResolvedValue(transientReply(404, { 'content-type': 'text/html' }));

    const edge = login();
    const edgeAssertion = expect(edge).rejects.toThrow(
      i18n.t('errors.auth.edgeRefused', { attempts: 8, statuses: Array(8).fill('404').join(', ') }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await edgeAssertion;

    vi.mocked(appleRequest).mockResolvedValue(transientReply(503, { 'x-responding-instance': 'MZFinance:9180028:::' }));

    const service = login();
    const serviceAssertion = expect(service).rejects.toThrow(
      i18n.t('errors.auth.transientFailure', { attempts: 8, statuses: Array(8).fill('503').join(', ') }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await serviceAssertion;
  });

  it('waits as long as Retry-After asks, within 30s', async () => {
    vi.mocked(appleRequest)
      .mockResolvedValueOnce(transientReply(429, { 'retry-after': '5' }))
      .mockResolvedValueOnce(accountReply());
    const onRetry = vi.fn();

    const account = login(onRetry);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(account).resolves.toBeDefined();
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ status: 429, delayMs: 5_000 }));
  });

  it('stops when Apple asks to wait longer than 30s', async () => {
    vi.mocked(appleRequest).mockResolvedValue(transientReply(503, { 'retry-after': '120' }));

    await expect(login()).rejects.toThrow(i18n.t('errors.auth.retryLater', { seconds: 120 }));
    expect(appleRequest).toHaveBeenCalledTimes(1);
  });
});
