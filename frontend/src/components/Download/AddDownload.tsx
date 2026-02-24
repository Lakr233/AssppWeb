import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import CountrySelect from "../common/CountrySelect";
import { useAccounts } from "../../hooks/useAccounts";
import { useDownloadAction } from "../../hooks/useDownloadAction";
import { useSettingsStore } from "../../store/settings";
import { useToastStore } from "../../store/toast";
import { lookupApp } from "../../api/search";
import { listVersions } from "../../apple/versionFinder";
import { countryCodeMap, storeIdToCountry } from "../../apple/config";
import { firstAccountCountry } from "../../utils/account";
import { getErrorMessage } from "../../utils/error";
import type { Software } from "../../types";

export default function AddDownload() {
  const { accounts, updateAccount } = useAccounts();
  const { defaultCountry } = useSettingsStore();
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const {
    startDownload,
    acquireLicense,
    toastDownloadError,
    toastLicenseError,
  } = useDownloadAction();

  const [bundleId, setBundleId] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [countryTouched, setCountryTouched] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [app, setApp] = useState<Software | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [step, setStep] = useState<"lookup" | "ready" | "versions">("lookup");
  const [loadingAction, setLoadingAction] = useState<
    "lookup" | "license" | "versions" | "download" | null
  >(null);

  const isLoading = loadingAction !== null;

  const availableCountryCodes = Array.from(
    new Set(
      accounts
        .map((a) => storeIdToCountry(a.store))
        .filter(Boolean) as string[],
    ),
  ).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  const allCountryCodes = Object.keys(countryCodeMap).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => storeIdToCountry(a.store) === country);
  }, [accounts, country]);

  useEffect(() => {
    if (filteredAccounts.length > 0) {
      if (
        !selectedAccount ||
        !filteredAccounts.find((a) => a.email === selectedAccount)
      ) {
        setSelectedAccount(filteredAccounts[0].email);
      }
    } else if (selectedAccount !== "") {
      setSelectedAccount("");
    }
  }, [filteredAccounts, selectedAccount]);

  const account = accounts.find((a) => a.email === selectedAccount);
  const autoCountry = firstAccountCountry(accounts);

  useEffect(() => {
    if (countryTouched) return;
    const nextCountry = autoCountry ?? defaultCountry;
    if (nextCountry && nextCountry !== country) {
      setCountry(nextCountry);
    }
  }, [autoCountry, country, countryTouched, defaultCountry]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!bundleId.trim()) return;
    setLoadingAction("lookup");
    try {
      const result = await lookupApp(bundleId.trim(), country);
      if (!result) {
        addToast(t("downloads.add.notFound"), "error");
        return;
      }
      setApp(result);
      setStep("ready");
    } catch (e) {
      addToast(getErrorMessage(e, t("downloads.add.lookupFailed")), "error");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleGetLicense() {
    if (!account || !app) return;
    setLoadingAction("license");
    try {
      await acquireLicense(account, app);
    } catch (e) {
      toastLicenseError(account, app, e);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLoadVersions() {
    if (!account || !app) return;
    setLoadingAction("versions");
    try {
      const result = await listVersions(account, app);
      setVersions(result.versions);
      await updateAccount({ ...account, cookies: result.updatedCookies });
      setStep("versions");
    } catch (e) {
      addToast(getErrorMessage(e, t("downloads.add.versionsFailed")), "error");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDownload() {
    if (!account || !app) return;
    setLoadingAction("download");
    try {
      await startDownload(account, app, selectedVersion || undefined);
    } catch (e) {
      toastDownloadError(account, app, e);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <PageContainer title={t("downloads.add.title")}>
      <div className="space-y-6">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("downloads.add.bundleId")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                placeholder={t("downloads.add.placeholder")}
                className="block w-full flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !bundleId.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loadingAction === "lookup"
                  ? t("downloads.add.lookingUp")
                  : t("downloads.add.lookup")}
              </button>
            </div>
          </div>
          <div className="flex w-full gap-3 overflow-hidden">
            <CountrySelect
              value={country}
              onChange={(v) => {
                setCountry(v);
                setCountryTouched(true);
              }}
              availableCountryCodes={availableCountryCodes}
              allCountryCodes={allCountryCodes}
              disabled={isLoading}
              className="w-1/2 truncate disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-1/2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 truncate disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              disabled={isLoading || filteredAccounts.length === 0}
            >
              {filteredAccounts.length > 0 ? (
                filteredAccounts.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.firstName} {a.lastName} ({a.email})
                  </option>
                ))
              ) : (
                <option value="">
                  {t("downloads.add.noAccountsForRegion")}
                </option>
              )}
            </select>
          </div>
        </form>

        {!app && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 px-4 bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
              <svg
                className="w-10 h-10 text-blue-500 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 text-center">
              {t("downloads.add.emptyTitle")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
              {t("downloads.add.emptyDesc")}
            </p>
          </div>
        )}

        {app && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-4 mb-4">
              <AppIcon url={app.artworkUrl} name={app.name} size="md" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {app.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {app.artistName}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  v{app.version} -{" "}
                  {app.formattedPrice ?? t("search.product.free")}
                </p>
              </div>
            </div>

            {step === "versions" && versions.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("downloads.add.versionOptional")}
                </label>
                <select
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 truncate disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <option value="">{t("downloads.add.latest")}</option>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(app.price === undefined || app.price === 0) && (
                <button
                  onClick={handleGetLicense}
                  disabled={isLoading || !account}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingAction === "license"
                    ? t("downloads.add.processing")
                    : t("downloads.add.getLicense")}
                </button>
              )}
              {step !== "versions" && (
                <button
                  onClick={handleLoadVersions}
                  disabled={isLoading || !account}
                  className="px-3 py-1.5 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingAction === "versions"
                    ? t("downloads.add.processing")
                    : t("downloads.add.selectVersion")}
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={isLoading || !account}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingAction === "download"
                  ? t("downloads.add.processing")
                  : t("downloads.add.download")}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
