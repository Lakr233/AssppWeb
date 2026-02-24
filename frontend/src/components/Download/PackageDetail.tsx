import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { getInstallInfo } from "../../api/install";
import { getAccountContext } from "../../utils/toast";

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, deleteDownload, pauseDownload, resumeDownload, hashToEmail } =
    useDownloads();
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const { accounts } = useAccounts();

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

  return (
    <PageContainer title={t("downloads.package.title")}>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <AppIcon
            url={task.software.artworkUrl}
            name={task.software.name}
            size="lg"
          />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {task.software.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              {task.software.artistName}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge status={task.status} />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                v{task.software.version}
              </span>
            </div>
          </div>
        </div>

        {(isActive || isPaused) && (
          <div>
            <ProgressBar progress={task.progress} />
            <div className="flex justify-between mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span>{Math.round(task.progress)}%</span>
              {task.speed && isActive && <span>{task.speed}</span>}
            </div>
          </div>
        )}

        {task.error && (
          <p className="text-sm text-red-500 dark:text-red-400">{task.error}</p>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {t("downloads.package.bundleId")}
              </dt>
              <dd className="text-gray-900 dark:text-gray-200 min-w-0 truncate ml-4">
                {task.software.bundleID}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {t("downloads.package.version")}
              </dt>
              <dd className="text-gray-900 dark:text-gray-200">
                {task.software.version}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {t("downloads.package.account")}
              </dt>
              <dd className="text-gray-900 dark:text-gray-200 min-w-0 truncate ml-4">
                {accountEmail || task.accountHash}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {t("downloads.package.created")}
              </dt>
              <dd className="text-gray-900 dark:text-gray-200">
                {new Date(task.createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {isCompleted && (
              <>
                {installInfo && (
                  <>
                    <a
                      href={installInfo.installUrl}
                      onClick={() => toastAction("toast.title.installStarted")}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      {t("downloads.package.install")}
                    </a>

                    <div className="relative group flex items-center">
                      <button
                        onClick={handleShare}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        {t("downloads.package.share")}
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 z-50 pointer-events-none">
                        <div className="bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex flex-col items-center">
                          <QRCodeSVG
                            value={installInfo.installUrl}
                            size={128}
                            className="mb-1"
                          />
                          <span className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                            {t("downloads.package.scan")}
                          </span>
                          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-200 transform rotate-45"></div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <a
                  href={`/api/packages/${task.id}/file?accountHash=${encodeURIComponent(task.accountHash)}`}
                  download
                  onClick={() => toastAction("toast.title.downloadIpaStarted")}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t("downloads.package.downloadIpa")}
                </a>
              </>
            )}
            {isActive && (
              <button
                onClick={() => pauseDownload(task.id)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t("downloads.package.pause")}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => resumeDownload(task.id)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("downloads.package.resume")}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              {t("downloads.package.delete")}
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
