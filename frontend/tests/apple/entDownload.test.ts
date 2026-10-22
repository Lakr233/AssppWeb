import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchEndpoint, downloadProduct } from '../../src/apple/downloadProduct';
import { appleRequest, type AppleRequestOptions } from '../../src/apple/request';
import { prefetchKBSync } from '../../src/apple/kbsync';
import { generateKBSync } from '../../src/apple/kbsync/generate';
import { buildPlist, parsePlist } from '../../src/apple/plist';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
vi.mock('../../src/apple/bag', () => ({
  fetchBag: async () => ({
    authURL: 'https://auth.itunes.apple.com/auth/v1/native/fast/',
    entDownloadURL: 'https://downloaddispatch.itunes.apple.com/WebObjects/DownloadDispatch.woa/wa/ent/download',
    redownloadURL: 'https://downloaddispatch.itunes.apple.com/r/redownload',
    updateURL: 'https://downloaddispatch.itunes.apple.com/up/updateProduct',
  }),
}));
vi.mock('../../src/apple/kbsync/generate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/apple/kbsync/generate')>()),
  generateKBSync: vi.fn(),
}));

const account: Account = {
  email: 'test@example.invalid',
  password: 'not-real',
  appleId: '',
  store: '143441',
  firstName: '',
  lastName: '',
  passwordToken: 'private-token',
  directoryServicesIdentifier: '123',
  cookies: [],
  deviceIdentifier: 'aabbccddeeff',
  pod: '26',
};
const app = { id: 6473753684, bundleID: 'com.anthropic.claude' } as Software;
const version = '879012345';
const cacheKey = 'asspp-kbsync-v1:123:aabbccddeeff';

function respond(body: string, status = 200) {
  return { status, statusText: '', headers: {}, rawHeaders: [] as [string, string][], body };
}
const catalog = respond(
  JSON.stringify({
    results: {
      [app.id]: {
        bundleId: app.bundleID,
        offers: [{ assets: [{ flavor: 'iosSoftware' }], version: { externalId: version } }],
      },
    },
  }),
);
const success = respond(
  buildPlist({
    songList: [
      {
        URL: 'https://example.invalid/app.ipa',
        metadata: { itemId: app.id, softwareVersionBundleId: app.bundleID, softwareVersionExternalIdentifier: version },
      },
    ],
  }),
);

function isEntDownload(request: AppleRequestOptions): boolean {
  return request.path.startsWith('/WebObjects/DownloadDispatch.woa/wa/ent/download?');
}

beforeEach(() => {
  vi.mocked(appleRequest).mockReset();
  vi.mocked(generateKBSync).mockReset();
  localStorage.clear();
});

describe('ent/download', () => {
  it('accepts only the bag ent/download endpoint', () => {
    expect(
      dispatchEndpoint(
        'https://downloaddispatch.itunes.apple.com/WebObjects/DownloadDispatch.woa/wa/ent/download',
        'ent',
        'aabbccddeeff',
      ),
    ).toEqual({
      host: 'downloaddispatch.itunes.apple.com',
      path: '/WebObjects/DownloadDispatch.woa/wa/ent/download?guid=aabbccddeeff',
      externalVersionIdKey: 'externalVersionId',
    });
    expect(
      dispatchEndpoint(
        'https://p26-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct',
        'ent',
        'x',
      ),
    ).toBeUndefined();
  });

  it('sends a kbsync download request and caches the blob', async () => {
    vi.mocked(generateKBSync).mockResolvedValue('fresh-kbsync');
    vi.mocked(appleRequest).mockImplementation(async (request) => {
      if (request.host === 'uclient-api.itunes.apple.com') return catalog;
      expect(isEntDownload(request)).toBe(true);
      expect(request.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'X-Apple-Store-Front': '143441-1',
        'X-Token': 'private-token',
        'X-Dsid': '123',
      });
      expect(parsePlist(request.body!)).toEqual({
        creditDisplay: '',
        guid: 'aabbccddeeff',
        kbsync: 'fresh-kbsync',
        salableAdamId: String(app.id),
        serialNumber: Buffer.from('54c8b0a988ccddeeff', 'hex').toString('base64'),
        externalVersionId: version,
      });
      return success;
    });

    const result = await downloadProduct(account, app);

    expect(result.dict.songList[0].URL).toBe('https://example.invalid/app.ipa');
    expect(generateKBSync).toHaveBeenCalledWith('aabbccddeeff', 123);
    expect(localStorage.getItem(cacheKey)).toBe('fresh-kbsync');
  });

  it('replaces a rejected cached blob once', async () => {
    localStorage.setItem(cacheKey, 'stale-kbsync');
    vi.mocked(generateKBSync).mockResolvedValue('fresh-kbsync');
    vi.mocked(appleRequest).mockImplementation(async (request) => {
      return parsePlist(request.body!).kbsync === 'fresh-kbsync' ? success : respond('', 403);
    });

    await downloadProduct(account, app, version);

    expect(generateKBSync).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(cacheKey)).toBe('fresh-kbsync');
  });

  it('falls back to the legacy chain and reports both failures', async () => {
    vi.mocked(generateKBSync).mockRejectedValue(new Error('StoreAgent global initialization returned -42404'));
    vi.mocked(appleRequest).mockImplementation(async (request) => {
      expect(isEntDownload(request)).toBe(false);
      if (request.path.includes('volumeStoreDownloadProduct')) return respond(buildPlist({ songList: [] }));
      return respond('', 403);
    });

    await expect(downloadProduct(account, app, version)).rejects.toThrow(
      'Apple download: HTTP 403; empty response; downloaddispatch.itunes.apple.com/r/redownload (ent/download: StoreAgent global initialization returned -42404)',
    );
    expect(localStorage.getItem(cacheKey)).toBeNull();
  });

  it('shares a background prefetch with the download that needs it', async () => {
    let finish!: (value: string) => void;
    vi.mocked(generateKBSync).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.mocked(appleRequest).mockResolvedValue(success);

    prefetchKBSync([account]);
    await vi.waitFor(() => expect(generateKBSync).toHaveBeenCalledTimes(1));
    const download = downloadProduct(account, app, version);
    finish('prefetched-kbsync');
    await download;

    expect(generateKBSync).toHaveBeenCalledTimes(1);
    expect(parsePlist(vi.mocked(appleRequest).mock.calls[0][0].body!).kbsync).toBe('prefetched-kbsync');
    expect(localStorage.getItem(cacheKey)).toBe('prefetched-kbsync');
  });
});
