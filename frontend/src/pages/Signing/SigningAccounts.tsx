import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../components/Layout/PageContainer';
import Modal from '../../components/common/Modal';
import { AccountsIcon, SigningIcon } from '../../components/common/icons';
import { useSigningStore } from '../../stores/signingStore';

export default function SigningAccounts() {
  const { accounts, currentAccountId, setCurrentAccount, removeAccount } = useSigningStore();
  const navigate = useNavigate();
  const [pendingRemove, setPendingRemove] = useState<{ id: string; email: string } | null>(null);

  const stats = useMemo(() => {
    const teamIds = new Set(accounts.map((account) => account.team?.identifier).filter(Boolean));
    const certificateCount = accounts.reduce(
      (sum, account) => sum + account.certificates.length,
      0
    );
    const deviceCount = accounts.reduce((sum, account) => sum + account.devices.length, 0);

    return {
      accountCount: accounts.length,
      teamCount: teamIds.size,
      certificateCount,
      deviceCount,
    };
  }, [accounts]);

  const currentAccount = accounts.find((account) => account.id === currentAccountId) ?? null;

  const handleRemove = (id: string, email: string) => {
    setPendingRemove({ id, email });
  };

  const confirmRemove = () => {
    if (!pendingRemove) {
      return;
    }

    removeAccount(pendingRemove.id);
    setPendingRemove(null);
  };

  return (
    <PageContainer
      title="Developer Accounts"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!currentAccountId && accounts[0]) {
                setCurrentAccount(accounts[0].id);
              }
              navigate('/signing/sign');
            }}
            disabled={accounts.length === 0}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign IPA
          </button>
          <button
            type="button"
            onClick={() => navigate('/signing/login')}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            Add Account
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              <SigningIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Select an active signing identity
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Choose one developer account as the default source for certificates, devices, and
                provisioning profiles.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Local Signing Cache</p>
            {currentAccount && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                Active: {currentAccount.email}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Accounts</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.accountCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Teams</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.teamCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Certificates</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.certificateCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Devices</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.deviceCount}</p>
            </div>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-gray-700 dark:bg-gray-900/30">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              <AccountsIcon className="h-6 w-6" />
            </div>
            <p className="text-base font-medium text-gray-900 dark:text-white">No signing account yet</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Add an Apple Developer account to start certificate and device management.
            </p>
            <button
              type="button"
              onClick={() => navigate('/signing/login')}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const isCurrent = currentAccountId === account.id;
              const teamLabel = account.team
                ? `${account.team.name} (${account.team.type})`
                : 'Team info not loaded';

              return (
                <div
                  key={account.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCurrentAccount(account.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setCurrentAccount(account.id);
                    }
                  }}
                  className={`rounded-lg border p-4 transition-colors ${
                    isCurrent
                      ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 dark:bg-blue-900/10'
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isCurrent ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {account.email}
                        </p>
                        {isCurrent && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{teamLabel}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {account.certificates.length} certs
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {account.devices.length} devices
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          DSID: {account.session.dsid}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemove(account.id, account.email);
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        title="Remove Signing Account"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {pendingRemove
            ? `Remove signing account "${pendingRemove.email}" from local storage?`
            : 'Remove this signing account from local storage?'}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingRemove(null)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmRemove}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </Modal>
    </PageContainer>
  );
}
