import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Alert from '../common/Alert';
import AppIcon from "../common/AppIcon";
import Spinner from '../common/Spinner';
import {
  isProductPreviewEnabled,
  previewProductAccounts,
  previewProductApp,
} from './productPreview';
import { useAccounts } from "../../hooks/useAccounts";
import { useDownloadAction } from "../../hooks/useDownloadAction";
import { useToastStore } from '../../store/toast';
import { lookupApp } from "../../api/search";
import { storeIdToCountry } from "../../apple/config";
import type { Software } from "../../types";

export default function ProductDetail() {
  const { appId } = useParams<{ appId: string }>();
  const location = useLocation();
  const { accounts } = useAccounts();
  const { t } = useTranslation();
  const addToast = useToastStore((state) => state.addToast);
  const {
    startDownload,
    acquireLicense,
    toastDownloadError,
    toastLicenseError,
  } = useDownloadAction();

  const previewEnabled = isProductPreviewEnabled(location.search);
  const productAccounts = previewEnabled ? previewProductAccounts : accounts;
  const routeState = location.state as {
    app?: Software;
    country?: string;
  } | null;
  const stateApp = previewEnabled ? previewProductApp : routeState?.app;
  const stateCountry = previewEnabled ? 'US' : routeState?.country;
  const [country] = useState(stateCountry ?? "US");
  const [app, setApp] = useState<Software | null>(stateApp ?? null);
  const [loading, setLoading] = useState(!stateApp);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [loadingAction, setLoadingAction] = useState<
    "purchase" | "download" | null
  >(null);

  const filteredAccounts = useMemo(
    () =>
      productAccounts.filter((a) => storeIdToCountry(a.store) === country),
    [productAccounts, country],
  );

  const account = filteredAccounts.find((a) => a.email === selectedAccount);
  const isDownloading = loadingAction === 'download';

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
    if (
      filteredAccounts.length > 0 &&
      !filteredAccounts.some((a) => a.email === selectedAccount)
    ) {
      setSelectedAccount(filteredAccounts[0].email);
    }
  }, [filteredAccounts, selectedAccount]);

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
    setLoadingAction("purchase");
    try {
      if (previewEnabled) {
        await waitForPreviewAction();
        addToast(
          t('search.product.previewActionComplete'),
          'success',
          t('search.product.previewBadge'),
        );
        return;
      }
      await acquireLicense(account, app);
    } catch (e) {
      toastLicenseError(account, app, e);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDownload() {
    if (!account || !app) return;
    setLoadingAction("download");
    try {
      if (previewEnabled) {
        await waitForPreviewAction();
        addToast(
          t('search.product.previewActionComplete'),
          'success',
          t('search.product.previewBadge'),
        );
        return;
      }
      await startDownload(account, app);
    } catch (e) {
      toastDownloadError(account, app, e);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <PageContainer>
      <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
        {previewEnabled && (
          <Alert type="warning">
            <span className="font-semibold">
              {t('search.product.previewBadge')}
            </span>{' '}
            {t('search.product.previewDescription')}
          </Alert>
        )}

        <section className="flex min-w-0 items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:gap-5 sm:p-6">
          <div className="shrink-0">
            <AppIcon url={app.artworkUrl} name={app.name} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              {app.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">{app.artistName}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                {app.formattedPrice ?? t("search.product.free")}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                {app.primaryGenreName}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                v{app.version}
              </span>
              <span>
                ★ {app.averageUserRating.toFixed(1)} ({app.userRatingCount}{" "}
                {t("search.product.ratings")})
              </span>
            </div>
          </div>
        </section>

        {productAccounts.length === 0 ? (
          <div className="rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800 ring-1 ring-yellow-200/70 dark:bg-yellow-950/30 dark:text-yellow-300 dark:ring-yellow-800/50">
            <Link to="/accounts/add" className="font-medium underline">
              {t("search.product.addAccountLink")}
            </Link>{" "}
            {t("search.product.addAccountPrompt")}
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800 ring-1 ring-yellow-200/70 dark:bg-yellow-950/30 dark:text-yellow-300 dark:ring-yellow-800/50">
            {t("search.product.noAccountsForRegion")}
          </div>
        ) : (
          <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("search.product.account")}
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="min-h-11 w-full min-w-0 rounded-xl border-0 bg-gray-100 px-3 py-2 text-base text-gray-900 focus:ring-2 focus:ring-blue-500/40 dark:bg-gray-800 dark:text-white"
                disabled={loadingAction !== null}
              >
                {filteredAccounts.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.firstName} {a.lastName} ({a.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 grid-flow-col auto-cols-fr gap-2 sm:gap-3">
              {(app.price === undefined || app.price === 0) && (
                <button
                  type="button"
                  onClick={handlePurchase}
                  disabled={loadingAction !== null}
                  className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-blue-50 px-2 py-2 text-center text-xs font-semibold leading-tight text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-950 sm:px-5 sm:text-sm"
                >
                  {loadingAction === "purchase"
                    ? t("search.product.processing")
                    : t("search.product.getLicense")}
                </button>
              )}
              <button
                type="button"
                onClick={handleDownload}
                disabled={loadingAction !== null || !account}
                aria-busy={isDownloading}
                className={`inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-2 py-2 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed sm:gap-2 sm:px-5 sm:text-sm ${
                  !account || (loadingAction !== null && !isDownloading)
                    ? 'opacity-50'
                    : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center"
                >
                  {isDownloading ? <Spinner /> : <DownloadIcon />}
                </span>
                <span>{t("search.product.download")}</span>
              </button>
              <Link
                to={`/search/${app.id}/versions`}
                state={{ app, country }}
                className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-gray-100 px-2 py-2 text-center text-xs font-semibold leading-tight text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:px-5 sm:text-sm"
              >
                {t("search.product.versionHistory")}
              </Link>
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
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
        </section>

        {app.description && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.description")}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {app.description}
            </p>
          </section>
        )}

        {app.releaseNotes && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.releaseNotes")}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {app.releaseNotes}
            </p>
          </section>
        )}

        {app.screenshotUrls && app.screenshotUrls.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10 sm:p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              {t("search.product.screenshots")}
            </h2>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {app.screenshotUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="h-64 shrink-0 snap-start snap-always rounded-3xl object-contain sm:h-80"
                  loading="lazy"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
      />
    </svg>
  );
}

function waitForPreviewAction(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 2000);
  });
}
