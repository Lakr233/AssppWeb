import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlist } from '../../src/apple/plist';
import { purchaseApp, PurchaseError } from '../../src/apple/purchase';
import { appleRequest } from '../../src/apple/request';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({
  appleRequest: vi.fn(),
}));

const account: Account = {
  email: 'test@example.com',
  password: 'password',
  appleId: 'test@example.com',
  store: '143441',
  firstName: 'Test',
  lastName: 'User',
  passwordToken: 'token',
  directoryServicesIdentifier: '123',
  cookies: [],
  deviceIdentifier: 'aabbccddeeff',
  pod: '26',
};

const app = { id: 1413936031, price: 0 } as Software;

function respondWith(dict: Record<string, unknown>) {
  vi.mocked(appleRequest).mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: {},
    rawHeaders: [],
    body: buildPlist(dict),
  });
}

describe('apple/purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats failureType 5002 as an already-owned license', async () => {
    respondWith({
      failureType: '5002',
      customerMessage: 'An unknown error has occurred',
    });

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: true,
    });
    expect(appleRequest).toHaveBeenCalledTimes(1);
  });

  it('reports a fresh purchase as not previously owned', async () => {
    respondWith({ jingleDocType: 'purchaseSuccess', status: 0 });

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: false,
    });
  });

  it('still rejects other failure types carrying the generic message', async () => {
    respondWith({
      failureType: '1008',
      customerMessage: 'An unknown error has occurred',
    });

    await expect(purchaseApp(account, app)).rejects.toBeInstanceOf(PurchaseError);
  });
});
