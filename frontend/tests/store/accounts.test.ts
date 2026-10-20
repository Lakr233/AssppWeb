import { describe, it, expect, beforeEach } from 'vitest';
import { useAccountsStore } from '../../src/store/accounts';
import type { Account } from '../../src/types';

const mockAccount: Account = {
  email: 'test@example.com',
  password: 'secret',
  appleId: 'test@example.com',
  store: '143441',
  firstName: 'Test',
  lastName: 'User',
  passwordToken: 'token123',
  directoryServicesIdentifier: 'dsid123',
  cookies: [],
};

describe('store/accounts', () => {
  beforeEach(async () => {
    // Clear the store
    const state = useAccountsStore.getState();
    for (const account of state.accounts) {
      await state.removeAccount(account.email);
    }
    await state.loadAccounts();
  });

  it('should start with empty accounts', async () => {
    await useAccountsStore.getState().loadAccounts();
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
  });

  it('should add an account', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);
    const accounts = useAccountsStore.getState().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].email).toBe('test@example.com');
    expect(accounts[0].firstName).toBe('Test');
  });

  it('should persist account to IndexedDB and reload', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);
    await useAccountsStore.getState().loadAccounts();
    const accounts = useAccountsStore.getState().accounts;
    expect(accounts.find((a) => a.email === 'test@example.com')).toBeDefined();
  });

  it('should remove an account', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);
    expect(useAccountsStore.getState().accounts).toHaveLength(1);

    await useAccountsStore.getState().removeAccount('test@example.com');
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
  });

  it('should update an account', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);

    const updated = {
      ...mockAccount,
      firstName: 'Updated',
      passwordToken: 'newtoken',
    };
    await useAccountsStore.getState().updateAccount(updated);

    const accounts = useAccountsStore.getState().accounts;
    expect(accounts[0].firstName).toBe('Updated');
    expect(accounts[0].passwordToken).toBe('newtoken');
  });

  it('should handle multiple accounts', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);
    await useAccountsStore.getState().addAccount({
      ...mockAccount,
      email: 'other@example.com',
      firstName: 'Other',
    });

    expect(useAccountsStore.getState().accounts).toHaveLength(2);
  });

  it('should replace account with same email on add', async () => {
    await useAccountsStore.getState().addAccount(mockAccount);
    await useAccountsStore.getState().addAccount({
      ...mockAccount,
      firstName: 'Replaced',
    });

    const accounts = useAccountsStore.getState().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].firstName).toBe('Replaced');
  });
});
