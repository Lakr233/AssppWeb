import { useAccountsStore } from '../store/accounts';

export function useAccounts() {
  const { accounts, loading, loadAccounts, addAccount, removeAccount, updateAccount } = useAccountsStore();

  function getAccount(email: string) {
    return accounts.find((a) => a.email === email);
  }

  return {
    accounts,
    loading,
    loadAccounts,
    addAccount,
    removeAccount,
    updateAccount,
    getAccount,
  };
}
