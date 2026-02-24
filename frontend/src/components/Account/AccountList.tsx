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
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
        /* Removed transition-colors to prevent dark mode flashing */
        <div className="flex flex-col items-center justify-center py-16 px-4 my-4 bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
            <svg
              className="w-12 h-12 text-blue-500 dark:text-blue-400"
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 text-center">
            {t("accounts.empty")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-sm">
            {t("accounts.emptyDesc")}
          </p>
          <Link
            to="/accounts/add"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 hover:shadow-md transition-all active:scale-95"
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
        <div className="space-y-2">
          {accounts.map((account) => {
            const countryCode =
              storeIdToCountry(account.store) || account.store;

            return (
              <NavLink
                key={account.email}
                to={`/accounts/${encodeURIComponent(account.email)}`}
                className={({ isActive }) =>
                  `block bg-white dark:bg-gray-900 rounded-lg border p-4 transition-colors ${
                    isActive
                      ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30"
                      : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                  }`
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {account.firstName} {account.lastName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {account.email}
                    </p>
                  </div>
                  <div className="text-sm text-gray-400 dark:text-gray-500">
                    {t(`countries.${countryCode}`, countryCode)}
                  </div>
                </div>
              </NavLink>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
