import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import { useAccountsStore } from "../../store/accounts";
import { storeIdToCountry } from "../../apple/config";

export default function AccountList() {
  const { t } = useTranslation();
  const { accounts, loading, loadAccounts } = useAccountsStore();

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  return (
    <PageContainer
      title={t("accounts.title")}
      action={
        <Link
          to="/accounts/add"
          className="inline-flex min-h-10 items-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {t("accounts.add")}
        </Link>
      }
    >
      {loading ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          {t("accounts.loading")}
        </div>
      ) : accounts.length === 0 ? (
        <div className="my-4 flex flex-col items-center justify-center rounded-3xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950">
            <svg
              className="h-8 w-8 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            {t("accounts.empty")}
          </h3>
          <p className="mb-6 max-w-full whitespace-nowrap text-[clamp(0.5625rem,2.8vw,0.875rem)] leading-relaxed tracking-[-0.015em] text-gray-500 dark:text-gray-400">
            {t("accounts.emptyDesc")}
          </p>
          <Link
            to="/accounts/add"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            {t("accounts.addFirst")}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {accounts.map((account) => {
              const countryCode =
                storeIdToCountry(account.store) || account.store;
              const countryName = t(`countries.${countryCode}`, countryCode);

              return (
                <NavLink
                  key={account.email}
                  to={`/accounts/${encodeURIComponent(account.email)}`}
                  className={({ isActive }) =>
                    `flex items-center gap-4 p-4 transition-colors ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950/50"
                        : "hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800/70 dark:active:bg-gray-800"
                    }`
                  }
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
                    {(account.firstName || account.email)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">
                      {account.firstName} {account.lastName}
                    </p>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                      {account.email}
                    </p>
                  </div>
                  <div
                    title={countryName}
                    className="max-w-24 shrink-0 truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400 sm:px-3"
                  >
                    <span className="sm:hidden">{countryCode}</span>
                    <span className="hidden truncate sm:block">
                      {countryName}
                    </span>
                  </div>
                  <span
                    className="text-xl text-gray-300 dark:text-gray-600"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
