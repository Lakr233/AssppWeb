import { useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import Modal from "../common/Modal";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useDownloadAction } from "../../hooks/useDownloadAction";
import { useToastStore } from "../../store/toast";
import { getInstallInfo } from "../../api/install";
import { authHeaders } from "../../api/client";
import { lookupApp } from "../../api/search";
import { storeIdToCountry } from "../../apple/config";
import { listVersions } from "../../apple/versionFinder";
import { getAccountContext } from "../../utils/toast";
import { isNewerVersion } from "../../utils/version";
import type { Software } from "../../types";

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, deleteDownload, pauseDownload, resumeDownload, hashToEmail } =
    useDownloads();
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const { accounts } = useAccounts();
  const { startDownload } = useDownloadAction();

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [latestApp, setLatestApp] = useState<Software | null>(null);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");

  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <PageContainer title={t("downloads.package.title")}>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {tasks.length === 0 ? t("loading") : t("downloads.package.notFound")}
        </div>
      </PageContainer>
    );
  }

  const isActive = task.status === "downloading" || task.status === "injecting";
  const isPaused = task.status === "paused";
  const isCompleted = task.status === "completed";
  const installInfo = isCompleted ? getInstallInfo(task.id) : null;

  const accountEmail = hashToEmail[task.accountHash];
  const account = accounts.find((a) => a.email === accountEmail);
  const ctx = getAccountContext(account, t);
  const appName = task.software.name;

  function toastAction(titleKey: string, type: "success" | "info" = "info") {
    addToast(t("toast.msg", { appName, ...ctx }), type, t(titleKey));
  }

  async function handleDelete() {
    if (!confirm(t("downloads.package.deleteConfirm"))) return;
    await deleteDownload(task!.id);
    toastAction("toast.title.deleteSuccess", "success");
    navigate("/downloads");
  }

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    if (!installInfo) return;

    const urlToShare = installInfo.installUrl;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToShare);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = urlToShare;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.warn("Clipboard fallback failed:", err);
    }

    addToast(
      t("toast.msgShare", { appName, ...ctx }),
      "success",
      t("toast.title.shareAcquired"),
    );

    if (navigator.share) {
      try {
        await navigator.share({ text: urlToShare });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.warn("Native share failed or aborted by user:", error);
      }
    }
  }

  async function handleCheckUpdate() {
    if (!task || !account) return;
    setCheckingUpdate(true);
    try {
      const country = storeIdToCountry(account.store) ?? "US";
      const app = await lookupApp(task.software.bundleID, country);

      if (app && isNewerVersion(app.version, task.software.version)) {
        setLatestApp(app);
        const result = await listVersions(account, app);
        setAvailableVersions(result.versions);
        setSelectedVersion(result.versions[0] || "");
        setShowUpdateModal(true);
      } else {
        addToast(t("downloads.package.noUpdate"), "info");
      }
    } catch {
      addToast(t("downloads.package.checkUpdateFailed"), "error");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleConfirmUpdate() {
    if (!task || !account || !latestApp) return;
    setShowUpdateModal(false);
    try {
      const isLatest =
        availableVersions.length > 0 &&
        selectedVersion === availableVersions[0];
      await startDownload(
        account,
        latestApp,
        isLatest ? undefined : selectedVersion,
      );
      await deleteDownload(task.id);
      navigate("/downloads");
    } catch {
      addToast(t("downloads.package.updateFailed"), "error");
    }
  }

  return (
    <PageContainer title={t("downloads.package.title")}>
      <div className="min-w-0 space-y-6">
        <div className="flex min-w-0 items-start gap-4">
          <AppIcon
            url={task.software.artworkUrl}
            name={task.software.name}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h2
              title={task.software.name}
              className="break-words text-xl font-bold text-gray-900 [overflow-wrap:anywhere] dark:text-white"
            >
              {task.software.name}
            </h2>
            <p
              title={task.software.artistName}
              className="break-words text-gray-500 [overflow-wrap:anywhere] dark:text-gray-400"
            >
              {task.software.artistName}
            </p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <Badge status={task.status} />
              <span
                title={task.software.version}
                className="min-w-0 break-all text-sm text-gray-500 dark:text-gray-400"
              >
                v{task.software.version}
              </span>
            </div>
          </div>
        </div>

        {(isActive || isPaused) && (
          <div className="min-w-0">
            <ProgressBar
              progress={task.progress}
              label={task.software.name}
            />
            <div className="mt-1 flex min-w-0 justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>{Math.round(task.progress)}%</span>
              {task.speed && isActive && (
                <span className="min-w-0 break-all text-right">
                  {task.speed}
                </span>
              )}
            </div>
          </div>
        )}

        {task.error && (
          <p
            role="alert"
            className="min-w-0 break-words rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 [overflow-wrap:anywhere] dark:bg-red-950/30 dark:text-red-400"
          >
            {task.error}
          </p>
        )}

        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <dl className="min-w-0 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <PackageDetailRow
              label={t("downloads.package.bundleId")}
              valueTitle={task.software.bundleID}
              mono
            >
              {task.software.bundleID}
            </PackageDetailRow>
            <PackageDetailRow
              label={t("downloads.package.version")}
              valueTitle={task.software.version}
              mono
            >
              {task.software.version}
            </PackageDetailRow>
            <PackageDetailRow
              label={t("downloads.package.account")}
              valueTitle={accountEmail || task.accountHash}
            >
              {accountEmail || task.accountHash}
            </PackageDetailRow>
            <PackageDetailRow label={t("downloads.package.created")}>
              {new Date(task.createdAt).toLocaleString()}
            </PackageDetailRow>
          </dl>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            {isCompleted && (
              <>
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:w-auto dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {checkingUpdate
                    ? t("downloads.package.checkingUpdate")
                    : t("downloads.package.checkUpdate")}
                </button>
                {installInfo && (
                  <>
                    <a
                      href={installInfo.installUrl}
                      onClick={() => toastAction("toast.title.installStarted")}
                      className="flex min-h-11 min-w-0 items-center justify-center whitespace-normal break-words rounded-lg bg-green-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-green-700 sm:w-auto"
                    >
                      {t("downloads.package.install")}
                    </a>

                    <div className="group relative flex min-w-0 items-center sm:w-auto">
                      <button
                        onClick={handleShare}
                        aria-describedby="install-qr-tooltip"
                        className="min-h-11 w-full min-w-0 cursor-pointer whitespace-normal break-words rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 sm:w-auto"
                      >
                        {t("downloads.package.share")}
                      </button>
                      <div
                        id="install-qr-tooltip"
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 opacity-0 transition-opacity duration-200 md:block md:invisible md:group-hover:visible md:group-hover:opacity-100 md:group-focus-within:visible md:group-focus-within:opacity-100"
                      >
                        <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                          <QRCodeSVG
                            value={installInfo.installUrl}
                            size={128}
                            className="mb-1"
                          />
                          <span className="mt-1 whitespace-nowrap text-xs text-gray-500">
                            {t("downloads.package.scan")}
                          </span>
                          <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-gray-200 bg-white" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <button
                  onClick={async () => {
                    toastAction("toast.title.downloadIpaStarted");
                    try {
                      const res = await fetch(
                        `/api/packages/${task.id}/file?accountHash=${encodeURIComponent(task.accountHash)}`,
                        { headers: authHeaders() },
                      );
                      if (!res.ok) throw new Error("Download failed");
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${task.software.name}_${task.software.version}.ipa`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      addToast(t("downloads.package.downloadFailed"), "error");
                    }
                  }}
                  className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
                >
                  {t("downloads.package.downloadIpa")}
                </button>
              </>
            )}
            {isActive && (
              <button
                onClick={() => pauseDownload(task.id)}
                className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("downloads.package.pause")}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => resumeDownload(task.id)}
                className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
              >
                {t("downloads.package.resume")}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:w-auto"
            >
              {t("downloads.package.delete")}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        title={t("downloads.package.updateAvailable")}
      >
        <div className="min-w-0 space-y-4">
          <p className="min-w-0 break-words text-sm text-gray-600 [overflow-wrap:anywhere] dark:text-gray-300">
            {t("downloads.package.updatePrompt", {
              version: latestApp?.version,
            })}
          </p>
          {availableVersions.length > 0 && (
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("downloads.package.selectVersion")}
              </label>
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="min-h-11 w-full min-w-0 max-w-full truncate rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {availableVersions.map((v, i) => (
                  <option key={v} value={v}>
                    {i === 0
                      ? t("downloads.package.latestVersion", { id: v })
                      : v}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-6 flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              onClick={() => setShowUpdateModal(false)}
              className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t("settings.data.cancel")}
            </button>
            <button
              onClick={handleConfirmUpdate}
              className="min-h-11 min-w-0 whitespace-normal break-words rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t("downloads.package.update")}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

function PackageDetailRow({
  label,
  children,
  mono = false,
  valueTitle,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  valueTitle?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:items-start sm:gap-6">
      <dt className="min-w-0 break-words text-gray-500 [overflow-wrap:anywhere] dark:text-gray-400">
        {label}
      </dt>
      <dd
        title={valueTitle}
        className={`min-w-0 max-w-full whitespace-pre-wrap break-all text-gray-900 sm:text-right dark:text-gray-200 ${
          mono ? "font-mono" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
