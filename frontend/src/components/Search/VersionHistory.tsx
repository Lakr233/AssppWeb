import { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import { useAccounts } from "../../hooks/useAccounts";
import { useDownloadAction } from "../../hooks/useDownloadAction";
import { useSettingsStore } from "../../store/settings";
import { listVersions } from "../../apple/versionFinder";
import { getVersionMetadata } from "../../apple/versionLookup";
import { getErrorMessage } from "../../utils/error";
import { useToastStore } from "../../store/toast";
import type { Software, VersionMetadata } from "../../types";

export default function VersionHistory() {
  const { appId } = useParams<{ appId: string }>();
  const location = useLocation();
  const { accounts, updateAccount } = useAccounts();
  const { defaultCountry } = useSettingsStore();
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const { startDownload, toastDownloadError } = useDownloadAction();

  const stateApp = (location.state as { app?: Software; country?: string })
    ?.app;
  const stateCountry = (location.state as { country?: string })?.country;
  const country = stateCountry ?? defaultCountry;

  const [app] = useState<Software | null>(stateApp ?? null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [versionMeta, setVersionMeta] = useState<
    Record<string, VersionMetadata>
  >({});
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState<Record<string, boolean>>({});
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].email);
    }
  }, [accounts, selectedAccount]);

  const account = accounts.find((a) => a.email === selectedAccount);

  async function handleLoadVersions() {
    if (!account || !app) return;
    setLoading(true);
    try {
      const result = await listVersions(account, app);
      setVersions(result.versions);
      await updateAccount({ ...account, cookies: result.updatedCookies });
    } catch (e) {
      addToast(getErrorMessage(e, t("search.versions.loadFailed")), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMeta(versionId: string) {
    if (!account || !app || versionMeta[versionId]) return;
    setLoadingMeta((prev) => ({ ...prev, [versionId]: true }));
    try {
      const result = await getVersionMetadata(account, app, versionId);
      setVersionMeta((prev) => ({ ...prev, [versionId]: result.metadata }));
      await updateAccount({ ...account, cookies: result.updatedCookies });
    } catch {
      // Silently fail for individual version metadata
    } finally {
      setLoadingMeta((prev) => ({ ...prev, [versionId]: false }));
    }
  }

  async function handleDownloadVersion(versionId: string) {
    if (!account || !app) return;
    setDownloadingVersion(versionId);
    try {
      await startDownload(account, app, versionId);
    } catch (e) {
      toastDownloadError(account, app, e);
    } finally {
      setDownloadingVersion(null);
    }
  }

  if (!app) {
    return (
      <PageContainer title={t("search.versions.title")}>
        <p className="text-gray-500">{t("search.versions.unavailable")}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={t("search.versions.title")}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <AppIcon url={app.artworkUrl} name={app.name} size="md" />
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white">
              {app.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {app.bundleID}
            </p>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("search.versions.account")}
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                {accounts.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.firstName} {a.lastName} ({a.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleLoadVersions}
              disabled={loading || !account}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {loading
                ? t("search.versions.loading")
                : t("search.versions.load")}
            </button>
          </div>
        )}

        {versions.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800">
            {versions.map((versionId) => {
              const meta = versionMeta[versionId];
              const isLoadingMeta = loadingMeta[versionId];
              const isDownloading = downloadingVersion === versionId;

              return (
                <div
                  key={versionId}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {meta ? `v${meta.displayVersion}` : `ID: ${versionId}`}
                    </p>
                    {meta && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(meta.releaseDate).toLocaleDateString()}
                      </p>
                    )}
                    {!meta && !isLoadingMeta && (
                      <button
                        onClick={() => handleLoadMeta(versionId)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1 transition-colors"
                      >
                        {t("search.versions.loadDetails")}
                      </button>
                    )}
                    {isLoadingMeta && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {t("search.versions.loading")}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownloadVersion(versionId)}
                    disabled={isDownloading || downloadingVersion !== null}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isDownloading
                      ? t("search.versions.downloading")
                      : t("search.versions.download")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
