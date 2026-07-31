import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import { useAccounts } from '../../hooks/useAccounts';
import { apiGet } from '../../api/client';
import { accountHash } from '../../utils/account';

interface Stats {
  accounts: number;
  downloads: number;
  packages: number;
}

export default function HomePage() {
  const { t } = useTranslation();
  const { accounts } = useAccounts();
  const [stats, setStats] = useState<Stats>({
    accounts: 0,
    downloads: 0,
    packages: 0,
  });

  useEffect(() => {
    setStats((prev) => ({ ...prev, accounts: accounts.length }));

    if (accounts.length === 0) {
      setStats((prev) => ({ ...prev, downloads: 0, packages: 0 }));
      return;
    }

    let cancelled = false;

    (async () => {
      const hashes = await Promise.all(accounts.map((a) => accountHash(a)));
      if (cancelled) return;

      const params = new URLSearchParams({
        accountHashes: hashes.join(','),
      });

      const [downloads, packages] = await Promise.all([
        apiGet<any[]>(`/api/downloads?${params}`).catch(() => []),
        apiGet<any[]>(`/api/packages?${params}`).catch(() => []),
      ]);

      if (cancelled) return;

      setStats((prev) => ({
        ...prev,
        downloads: Array.isArray(downloads) ? downloads.length : 0,
        packages: Array.isArray(packages) ? packages.length : 0,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  const primaryAction =
    accounts.length === 0
      ? {
          to: '/accounts/add',
          label: t('home.actions.addAccount'),
        }
      : {
          to: '/search',
          label: t('home.actions.searchApps'),
        };

  return (
    <PageContainer>
      <div className="space-y-8 pb-4">
        <section className="relative isolate min-h-80 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 px-6 py-8 sm:min-h-96 sm:px-10 sm:py-10 dark:from-blue-700 dark:via-blue-600 dark:to-indigo-700">
          <div
            aria-hidden="true"
            className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl"
          />

          <div className="relative z-10 flex min-h-64 max-w-xl flex-col items-start justify-center sm:min-h-76">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-white" />
              App Store
            </div>
            <h1 className="max-w-full whitespace-nowrap text-[clamp(1.5rem,7vw,1.875rem)] font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {t('home.welcome')}
            </h1>
            <p className="mt-4 max-w-full whitespace-nowrap text-[clamp(0.625rem,3.1vw,1rem)] leading-relaxed tracking-[-0.015em] text-blue-50 sm:max-w-lg sm:text-lg sm:leading-7">
              {t('home.subtitle')}
            </p>
            <Link
              to={primaryAction.to}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600"
            >
              {primaryAction.label}
              <ArrowRightIcon />
            </Link>
          </div>

          <div
            aria-hidden="true"
            className="absolute -bottom-6 -right-5 hidden h-64 w-64 rotate-3 grid-cols-2 gap-3 rounded-[2.5rem] border border-white/20 bg-white/10 p-5 backdrop-blur-md lg:grid"
          >
            <div className="flex items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-300 to-blue-500 text-white">
              <SearchGlyph className="h-10 w-10" />
            </div>
            <div className="flex items-center justify-center rounded-3xl bg-gradient-to-br from-violet-300 to-indigo-500 text-white">
              <AccountGlyph className="h-10 w-10" />
            </div>
            <div className="flex items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-300 to-teal-500 text-white">
              <DownloadGlyph className="h-10 w-10" />
            </div>
            <div className="flex items-center justify-center rounded-3xl bg-white text-2xl font-semibold text-blue-600">
              A
            </div>
          </div>
        </section>

        <section
          aria-label={t('home.welcome')}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <StatCard
            icon={<AccountGlyph className="h-5 w-5" />}
            iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            label={t('home.stats.accounts')}
            value={stats.accounts}
          />
          <StatCard
            icon={<DownloadGlyph className="h-5 w-5" />}
            iconClassName="bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            label={t('home.stats.downloads')}
            value={stats.downloads}
          />
          <StatCard
            icon={<PackageGlyph className="h-5 w-5" />}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            label={t('home.stats.packages')}
            value={stats.packages}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            to="/accounts/add"
            icon={<AccountGlyph className="h-6 w-6" />}
            iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            title={t('home.actions.addAccount')}
            description={t('home.actions.addAccountDesc')}
          />
          <ActionCard
            to="/search"
            icon={<SearchGlyph className="h-6 w-6" />}
            iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
            title={t('home.actions.searchApps')}
            description={t('home.actions.searchAppsDesc')}
          />
          <ActionCard
            to="/downloads"
            icon={<DownloadGlyph className="h-6 w-6" />}
            iconClassName="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            title={t('home.actions.viewDownloads')}
            description={t('home.actions.viewDownloadsDesc')}
          />
        </section>
      </div>
    </PageContainer>
  );
}

function StatCard({
  icon,
  iconClassName,
  label,
  value,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
        <div
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  to,
  icon,
  iconClassName,
  title,
  description,
}: {
  to: string;
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-44 flex-col rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 dark:focus-visible:ring-offset-gray-950"
    >
      <div className="flex items-start justify-between gap-4">
        <div
          aria-hidden="true"
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClassName}`}
        >
          {icon}
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors group-hover:bg-blue-600 group-hover:text-white dark:bg-gray-800 dark:text-gray-400">
          <ArrowRightIcon />
        </span>
      </div>
      <div className="mt-auto pt-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
    </Link>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
    </svg>
  );
}

function AccountGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.12a7.5 7.5 0 0 1 15 0A17.93 17.93 0 0 1 12 21.75a17.93 17.93 0 0 1-7.5-1.63Z"
      />
    </svg>
  );
}

function SearchGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.05 6.05a7.5 7.5 0 0 0 10.6 10.6Z"
      />
    </svg>
  );
}

function DownloadGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15"
      />
    </svg>
  );
}

function PackageGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 8.25-9-5.25-9 5.25m18 0-9 5.25m9-5.25v7.5L12 21m0-7.5L3 8.25m9 5.25V21M3 8.25v7.5L12 21"
      />
    </svg>
  );
}
