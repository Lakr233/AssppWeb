import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchEndpoint, downloadProduct, needsDownloadFallback } from '../../src/apple/downloadProduct';
import { appleRequest } from '../../src/apple/request';
import { buildPlist, parsePlist } from '../../src/apple/plist';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
vi.mock('../../src/apple/bag', () => ({
  fetchBag: async () => ({
    redownloadURL: 'https://downloaddispatch.itunes.apple.com/r/redownload',
    updateURL: 'https://downloaddispatch.itunes.apple.com/up/updateProduct',
  }),
}));

const account = {
  store: '143465',
  pod: '6',
  deviceIdentifier: 'test-device',
  directoryServicesIdentifier: 'test-dsid',
  cookies: [],
} as unknown as Account;
const app = { id: 736536022, bundleID: 'tv.danmaku.bilianime' } as Software;
const metadata = {
  itemId: app.id,
  softwareVersionBundleId: app.bundleID,
  softwareVersionExternalIdentifier: 891329111,
};
const response = (body: string, status = 200) => ({
  status,
  body,
  statusText: '',
  headers: {},
  rawHeaders: [],
});

beforeEach(() => {
  vi.mocked(appleRequest).mockReset();
});

describe('download recovery boundaries', () => {
  it.each([
    [{ status: 0, authorized: false, songList: [] }, true],
    [{ failureType: '5002', songList: [] }, true],
    [{ customerMessage: 'App No Longer Available', songList: [] }, true],
    [{ failureType: '2042' }, false],
    [{ failureType: '9610' }, false],
    [{ status: -1 }, false],
    [{ action: { url: 'https://buy.itunes.apple.com/termsPage' } }, false],
    [{ dialog: { explanation: 'Review your account' } }, false],
    [{ customerMessage: 'Accept new terms' }, false],
    [{ songList: [{}] }, false],
  ])('does not turn auth/license failures into endpoint retries: %j', (dict, expected) => {
    expect(needsDownloadFallback(dict)).toBe(expected);
  });

  it.each([
    'http://downloaddispatch.itunes.apple.com/up/updateProduct',
    'https://example.com/up/updateProduct',
    'https://downloaddispatch.itunes.apple.com/up/updateProduct?token=example',
    'https://user@downloaddispatch.itunes.apple.com/up/updateProduct',
  ])('rejects untrusted dispatch endpoints: %s', (url) => {
    expect(dispatchEndpoint(url, 'update', 'device')).toBeUndefined();
  });
});

// Captured failure shape: primary HTTP 200 with an empty songList, followed by
// redownload HTTP 500 with no body. Only pinned updateProduct returns the app.
// Wrong app/version metadata must never be accepted as a successful recovery.
it.each([
  { mismatch: false, redownloadCode: '' },
  { mismatch: true, redownloadCode: '' },
  { mismatch: false, redownloadCode: '5002' },
])('recovers empty/5002 responses and validates metadata: %j', async ({ mismatch, redownloadCode }) => {
  vi.mocked(appleRequest).mockImplementation(async (request) => {
    if (request.host === 'uclient-api.itunes.apple.com') {
      expect(request.cookies).toBeUndefined();
      return response(
        JSON.stringify({
          results: {
            [app.id]: {
              bundleId: app.bundleID,
              offers: [
                {
                  assets: [{ flavor: 'iosSoftware' }],
                  version: { externalId: 891329111 },
                },
              ],
            },
          },
        }),
      );
    }
    const payload = parsePlist(request.body!);
    expect(payload.serialNumber).toBe('0');
    if (request.path.includes('volumeStoreDownloadProduct')) {
      return response(buildPlist({ status: 0, authorized: false, songList: [] }));
    }
    expect(payload.appExtVrsId).toBe('891329111');
    expect(payload.externalVersionId).toBeUndefined();
    if (request.path.startsWith('/r/redownload'))
      return redownloadCode ? response(buildPlist({ failureType: redownloadCode })) : response('', 500);
    expect(request.path).toMatch(/^\/up\/updateProduct\?/);
    return response(
      buildPlist({
        status: 0,
        songList: [{ metadata: { ...metadata, itemId: mismatch ? 1 : app.id } }],
      }),
    );
  });
  if (mismatch) {
    await expect(downloadProduct(account, app)).rejects.toThrow();
  } else {
    const result = await downloadProduct(account, app);
    expect(result.dict.songList[0].metadata).toEqual(metadata);
  }
});
