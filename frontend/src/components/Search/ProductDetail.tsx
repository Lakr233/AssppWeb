import { useState, useEffect } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import Alert from "../common/Alert";
import { useAccounts } from "../../hooks/useAccounts";
import { useSettingsStore } from "../../store/settings";
import { lookupApp } from "../../api/search";
import { purchaseApp } from "../../apple/purchase";
import { getDownloadInfo } from "../../apple/download";
import { apiPost } from "../../api/client";
import {
  accountHash,
  accountStoreCountry,
  firstAccountCountry,
} from "../../utils/account";
import { storeIdToCountry } from "../../apple/config";
import { getErrorMessage } from "../../utils/error";
import type { Software } from "../../types";

export default function ProductDetail() {
  const { appId } = useParams<{ appId: string }>();
  const location = useLocation();
  const { accounts, updateAccount } = useAccounts();
  const { defaultCountry } = useSettingsStore();
  const { t } = useTranslation();

  const navigate = useNavigate();
  const stateApp = (location.state as { app?: Software; country?: string })
    ?.app;
  const stateCountry = (location.state as { country?: string })?.country;
  const [country, setCountry] = useState(stateCountry ?? defaultCountry);
  const [app, setApp] = useState<Software | null>(stateApp ?? null);
  const [loading, setLoading] = useState(!stateApp);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const account = accounts.find((a) => a.email === selectedAccount);

  useEffect(() => {
    if (!stateApp && appId) {
      setLoading(true);
      lookupApp(appId, country)
        .then((result) => {
          setApp(result);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [appId, stateApp, country]);

  useEffect(() => {
    if (stateCountry) return;
    const accountCountry =
      accountStoreCountry(account) ?? firstAccountCountry(accounts);
    const nextCountry = accountCountry ?? defaultCountry;
    if (nextCountry && nextCountry !== country) {
      setCountry(nextCountry);
    }
  }, [account, accounts, country, defaultCountry, stateCountry]);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].email);
    }
  }, [accounts, selectedAccount]);

  if (loading) {
    return (
      <PageContainer title={t("search.product.title")}>
        <div className="text-center text-gray-500 py-12">{t("loading")}</div>
      </PageContainer>
    );
  }

  if (!app) {
    return (
      <PageContainer title={t("search.product.title")}>
        <p className="text-gray-500">{t("search.product.notFound")}</p>
      </PageContainer>
    );
  }

  async function handlePurchase() {
    if (!account || !app) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const result = await purchaseApp(account, app);
      await updateAccount({ ...account, cookies: result.updatedCookies });
      setSuccess(t("search.product.licenseSuccess"));
    } catch (e) {
      setError(getErrorMessage(e, t("search.product.purchaseFailed")));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownload() {
    if (!account || !app) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const { output, updatedCookies } = await getDownloadInfo(account, app);
      await updateAccount({ ...account, cookies: updatedCookies });
      const hash = await accountHash(account);
      const versionedSoftware = {
        ...app,
        version: output.bundleShortVersionString,
      };
      await apiPost("/api/downloads", {
        software: versionedSoftware,
        accountHash: hash,
        downloadURL: output.downloadURL,
        sinfs: output.sinfs,
        iTunesMetadata: output.iTunesMetadata,
      });
      navigate("/downloads");
    } catch (e) {
      setError(getErrorMessage(e, t("search.product.downloadFailed")));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <AppIcon url={app.artworkUrl} name={app.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {app.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">{app.artistName}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{app.formattedPrice ?? t("search.product.free")}</span>
              <span>{app.primaryGenreName}</span>
              <span>v{app.version}</span>
              <span>
                {app.averageUserRating.toFixed(1)} ({app.userRatingCount}{" "}
                {t("search.product.ratings")})
              </span>
            </div>
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        {accounts.length === 0 ? (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
            <Link to="/accounts/add" className="font-medium underline">
              {t("search.product.addAccountLink")}
            </Link>{" "}
            {t("search.product.addAccountPrompt")}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("search.product.account")}
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={actionLoading}
              >
                {accounts.map((a) => {
                  const regionCode = storeIdToCountry(a.store);
                  const regionDisplay = regionCode
                    ? t(`countries.${regionCode}`, regionCode)
                    : a.store;
                  return (
                    <option key={a.email} value={a.email}>
                      {a.firstName} {a.lastName} ({a.email})
                      {regionDisplay ? ` - ${regionDisplay}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              {(app.price === undefined || app.price === 0) && (
                <button
                  onClick={handlePurchase}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading
                    ? t("search.product.processing")
                    : t("search.product.getLicense")}
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading
                  ? t("search.product.processing")
                  : t("search.product.download")}
              </button>
              <Link
                to={`/search/${app.id}/versions`}
                state={{ app, country }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t("search.product.versionHistory")}
              </Link>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
            {t("search.product.details")}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.bundleId")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200 break-all">
              {app.bundleID}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.version")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200">{app.version}</dd>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.size")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200">
              {app.fileSizeBytes
                ? `${(parseInt(app.fileSizeBytes) / 1024 / 1024).toFixed(1)} MB`
                : "N/A"}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.minOs")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200">
              {app.minimumOsVersion}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.seller")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200">
              {app.sellerName}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("search.product.released")}
            </dt>
            <dd className="text-gray-900 dark:text-gray-200">
              {new Date(app.releaseDate).toLocaleDateString()}
            </dd>
          </dl>
        </div>

        {app.description && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.description")}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {app.description}
            </p>
          </div>
        )}

        {app.releaseNotes && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.releaseNotes")}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {app.releaseNotes}
            </p>
          </div>
        )}

        {app.screenshotUrls && app.screenshotUrls.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.screenshots")}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {app.screenshotUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="h-48 sm:h-64 rounded-lg object-contain flex-shrink-0"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
