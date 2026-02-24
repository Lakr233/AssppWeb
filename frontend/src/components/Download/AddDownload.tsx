import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
// Removed Alert component / 移除了 Alert 组件
import CountrySelect from "../common/CountrySelect";
import { useAccounts } from "../../hooks/useAccounts";
import { useSettingsStore } from "../../store/settings";
import { lookupApp } from "../../api/search";
import { getDownloadInfo } from "../../apple/download";
import { purchaseApp } from "../../apple/purchase";
import { listVersions } from "../../apple/versionFinder";
import { apiPost } from "../../api/client";
import { countryCodeMap, storeIdToCountry } from "../../apple/config";
import {
  accountHash,
  firstAccountCountry,
} from "../../utils/account";
import { getErrorMessage } from "../../utils/error";
import type { Software } from "../../types";
// Import useToastStore / 引入全局 Toast Store
import { useToastStore } from "../../store/toast";

export default function AddDownload() {
  const navigate = useNavigate();
  const { accounts, updateAccount } = useAccounts();
  const { defaultCountry } = useSettingsStore();
  const { t } = useTranslation();
  // Get addToast function / 获取 addToast 方法
  const addToast = useToastStore((s) => s.addToast);

  const [bundleId, setBundleId] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [countryTouched, setCountryTouched] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [app, setApp] = useState<Software | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [step, setStep] = useState<"lookup" | "ready" | "versions">("lookup");
  const [loading, setLoading] = useState(false);
  // Removed error local state / 移除本地错误状态

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
    } else {
      if (selectedAccount !== "") {
        setSelectedAccount("");
      }
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
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function handleGetLicense() {
    if (!account || !app) return;
    setLoading(true);

    const userName = `${account.firstName} ${account.lastName}`;
    const appleId = account.email;
    const appName = app.name;
    const rawCountryCode = storeIdToCountry(account.store) || "";
    const countryStr = rawCountryCode ? t(`countries.${rawCountryCode}`, rawCountryCode) : account.store;

    try {
      const result = await purchaseApp(account, app);
      await updateAccount({ ...account, cookies: result.updatedCookies });
      // Notify license success with title / 带标题的许可证获取成功通知
      addToast(
        t("toast.msg", { appName, userName, appleId, country: countryStr }),
        "success",
        t("toast.title.licenseSuccess")
      );
    } catch (e) {
      // Notify license failure with title / 带标题的许可证获取失败通知
      addToast(
        t("toast.msgFailed", { appName, userName, appleId, country: countryStr, error: getErrorMessage(e, "") }),
        "error",
        t("toast.title.licenseFailed")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadVersions() {
    if (!account || !app) return;
    setLoading(true);
    try {
      const result = await listVersions(account, app);
      setVersions(result.versions);
      await updateAccount({ ...account, cookies: result.updatedCookies });
      setStep("versions");
    } catch (e) {
      addToast(getErrorMessage(e, t("downloads.add.versionsFailed")), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!account || !app) return;
    setLoading(true);

    const userName = `${account.firstName} ${account.lastName}`;
    const appleId = account.email;
    const appName = app.name;
    const rawCountryCode = storeIdToCountry(account.store) || "";
    const countryStr = rawCountryCode ? t(`countries.${rawCountryCode}`, rawCountryCode) : account.store;


    try {
      const { output, updatedCookies } = await getDownloadInfo(
        account,
        app,
        selectedVersion || undefined,
      );
      await updateAccount({ ...account, cookies: updatedCookies });
      const hash = await accountHash(account);
      await apiPost("/api/downloads", {
        software: app,
        accountHash: hash,
        downloadURL: output.downloadURL,
        sinfs: output.sinfs,
        iTunesMetadata: output.iTunesMetadata,
      });
      
      // Only show download started when task is successfully submitted / 仅在任务成功提交后台后显示开始下载
      addToast(
        t("toast.msg", { appName, userName, appleId, country: countryStr }),
        "info",
        t("toast.title.downloadStarted")
      );
    } catch (e) {
      // Notify download failed with title / 带标题的下载失败通知
      addToast(
        t("toast.msgFailed", { appName, userName, appleId, country: countryStr, error: getErrorMessage(e, "") }),
        "error",
        t("toast.title.downloadFailed")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer title={t("downloads.add.title")}>
      <div className="space-y-6">
        {/* Removed Alert component block / 移除了 Alert 组件的代码块 */}

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
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !bundleId.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loading && step === "lookup"
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
              disabled={loading}
              className="w-1/2 truncate disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-1/2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 truncate disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              disabled={loading || filteredAccounts.length === 0}
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

        {/* Removed transition-colors to prevent dark mode flashing */}
        {!app && !loading && (
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
                  disabled={loading || !account}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("downloads.add.getLicense")}
                </button>
              )}
              {step !== "versions" && (
                <button
                  onClick={handleLoadVersions}
                  disabled={loading || !account}
                  className="px-3 py-1.5 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("downloads.add.selectVersion")}
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={loading || !account}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
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
