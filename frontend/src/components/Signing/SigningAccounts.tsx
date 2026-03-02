import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import Modal from '../common/Modal';
import { AccountsIcon, SigningIcon } from '../common/icons';
import { useSigningStore } from '../../store/signing';

export default function SigningAccounts() {
  const { t } = useTranslation();
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
      title={t('signing.accounts.title')}
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
            {t('signing.accounts.signIpa')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/signing/login')}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {t('signing.accounts.addAccount')}
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
                {t('signing.accounts.selectIdentity')}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('signing.accounts.selectIdentityDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('signing.accounts.localCache')}</p>
            {currentAccount && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {t('signing.accounts.activeLabel', { email: currentAccount.email })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('signing.accounts.stats.accounts')}</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.accountCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('signing.accounts.stats.teams')}</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.teamCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('signing.accounts.stats.certificates')}</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.certificateCount}</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('signing.accounts.stats.devices')}</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{stats.deviceCount}</p>
            </div>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-gray-700 dark:bg-gray-900/30">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              <AccountsIcon className="h-6 w-6" />
            </div>
            <p className="text-base font-medium text-gray-900 dark:text-white">{t('signing.accounts.empty')}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('signing.accounts.emptyDesc')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/signing/login')}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {t('signing.accounts.goToSignIn')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const isCurrent = currentAccountId === account.id;
              const teamLabel = account.team
                ? `${account.team.name} (${account.team.type})`
                : t('signing.accounts.teamNotLoaded');

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
                            {t('signing.accounts.active')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{teamLabel}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {t('signing.accounts.certs', { count: account.certificates.length })}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {t('signing.accounts.deviceCount', { count: account.devices.length })}
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
                      {t('signing.accounts.remove')}
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
        title={t('signing.accounts.removeTitle')}
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {pendingRemove
            ? t('signing.accounts.removeConfirm', { email: pendingRemove.email })
            : t('signing.accounts.removeDefault')}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingRemove(null)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('signing.accounts.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmRemove}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            {t('signing.accounts.remove')}
          </button>
        </div>
      </Modal>
    </PageContainer>
  );
}
