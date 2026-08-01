import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Modal from "../common/Modal";
import ProgressBar from "../common/ProgressBar";
import Spinner from "../common/Spinner";
import DownloadItem from "./DownloadItem";
import {
  isDownloadPreviewEnabled,
  isPreviewDownloadTask,
  previewDownloadTasks,
} from "./previewTasks";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useDownloadAction } from "../../hooks/useDownloadAction";
import { useToastStore } from "../../store/toast";
import { lookupApp } from "../../api/search";
import { getAccountContext } from "../../utils/toast";
import { isNewerVersion } from "../../utils/version";
import { storeIdToCountry } from "../../apple/config";
import type { DownloadTask } from "../../types";

type StatusFilter = "all" | DownloadTask["status"];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DownloadList() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    tasks,
    loading,
    pauseDownload,
    resumeDownload,
    deleteDownload,
    hashToEmail,
  } = useDownloads();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const addToast = useToastStore((s) => s.addToast);
  const { accounts } = useAccounts();
  const { startDownload } = useDownloadAction();
  const previewEnabled = isDownloadPreviewEnabled(location.search);
  const displayTasks = previewEnabled ? previewDownloadTasks : tasks;

  const [checkingAll, setCheckingAll] = useState(false);
  const cancelCheckRef = useRef(false);
  const [checkProgress, setCheckProgress] = useState({
    current: 0,
    total: 0,
    appName: "",
  });

  useEffect(() => {
    return () => {
      cancelCheckRef.current = true;
    };
  }, []);

  const filtered =
    filter === "all"
      ? displayTasks
      : displayTasks.filter((task) => task.status === filter);

  const sortedTasks = [...filtered].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  function handleDelete(id: string) {
    const task = displayTasks.find((item) => item.id === id);
    if (task && isPreviewDownloadTask(task)) {
      showPreviewNotice();
      return;
    }

    if (!confirm(t("downloads.deleteConfirm"))) return;

    if (task) {
      const accountEmail = hashToEmail[task.accountHash];
      const account = accounts.find((a) => a.email === accountEmail);
      const ctx = getAccountContext(account, t);

      addToast(
        t("toast.msg", { appName: task.software.name, ...ctx }),
        "success",
        t("toast.title.deleteSuccess"),
      );
    }

    deleteDownload(id);
  }

  function showPreviewNotice() {
    addToast(
      t("downloads.preview.actionHint"),
      "info",
      t("downloads.preview.badge"),
    );
  }

  function handlePause(id: string) {
    if (previewEnabled) {
      showPreviewNotice();
      return;
    }
    pauseDownload(id);
  }

  function handleResume(id: string) {
    if (previewEnabled) {
      showPreviewNotice();
      return;
    }
    resumeDownload(id);
  }

  function handleCancelCheck() {
    cancelCheckRef.current = true;
    setCheckingAll(false);
  }

  async function handleCheckAllUpdates() {
    if (previewEnabled) {
      showPreviewNotice();
      return;
    }

    cancelCheckRef.current = false;
    setCheckingAll(true);
    addToast(t("downloads.checkUpdatesStarted"), "info");
    let count = 0;
    const completedTasks = tasks.filter((t) => t.status === "completed");

    setCheckProgress({ current: 0, total: completedTasks.length, appName: "" });

    for (let i = 0; i < completedTasks.length; i++) {
      if (cancelCheckRef.current) break;

      const task = completedTasks[i];
      const accountEmail = hashToEmail[task.accountHash];
      const account = accounts.find((a) => a.email === accountEmail);

      setCheckProgress((prev) => ({ ...prev, appName: task.software.name }));

      if (!account) {
        setCheckProgress((prev) => ({ ...prev, current: i + 1 }));
        continue;
      }

      try {
        await delay(1500);
        if (cancelCheckRef.current) break;

        const country = storeIdToCountry(account.store) ?? "US";
        const latestApp = await lookupApp(task.software.bundleID, country);

        if (
          latestApp &&
          isNewerVersion(latestApp.version, task.software.version)
        ) {
          await startDownload(account, latestApp);
          await deleteDownload(task.id);
          count++;
        }
      } catch {
        // Continue with next item
      }

      setCheckProgress((prev) => ({ ...prev, current: i + 1 }));
    }

    if (!cancelCheckRef.current) {
      await delay(500);
      if (!cancelCheckRef.current) {
        setCheckingAll(false);
        addToast(t("downloads.checkUpdatesCompleted", { count }), "success");
      }
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 grid grid-cols-2 items-start gap-2 min-[360px]:grid-cols-3 sm:mb-7 sm:grid-cols-6">
        <h1 className="col-span-2 min-w-0 text-[2rem] font-semibold leading-[1.12] tracking-[-0.035em] text-gray-900 min-[360px]:col-span-1 sm:col-span-4 sm:text-[2.125rem] dark:text-white">
          {t("downloads.title")}
        </h1>
        <button
          onClick={handleCheckAllUpdates}
          disabled={checkingAll}
          className="flex h-9 w-full min-w-0 items-center justify-center rounded-full bg-emerald-100 px-2.5 text-center text-[clamp(0.75rem,3.6vw,0.875rem)] font-semibold leading-tight text-emerald-800 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:bg-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
        >
          {checkingAll
            ? t("downloads.checkingUpdates")
            : t("downloads.checkUpdates")}
        </button>
        <Link
          to="/downloads/add"
          className="flex h-9 w-full min-w-0 items-center justify-center rounded-full bg-blue-600 px-2.5 text-center text-[clamp(0.75rem,3.6vw,0.875rem)] font-semibold leading-tight text-white transition-colors hover:bg-blue-700"
        >
          {t("downloads.new")}
        </Link>
      </div>

      <div
        className="mb-5 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-6"
        role="group"
        aria-label={t("downloads.title")}
      >
        {(
          [
            "all",
            "downloading",
            "pending",
            "paused",
            "completed",
            "failed",
          ] as StatusFilter[]
        ).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`flex h-9 w-full min-w-0 items-center justify-center rounded-full px-2.5 text-center text-[clamp(0.75rem,3.6vw,0.875rem)] font-semibold leading-tight transition-colors ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-gray-800"
            }`}
          >
            {t(`downloads.status.${status}`)}
            <span className="ml-1">
              {`(${
                status === "all"
                  ? displayTasks.length
                  : displayTasks.filter((task) => task.status === status).length
              })`}
            </span>
          </button>
        ))}
      </div>

      <div
        role="note"
        aria-label={t("downloads.warning")}
        title={t("downloads.warning")}
        className="mb-5 min-w-0 max-w-full overflow-hidden rounded-2xl bg-amber-50 px-2.5 py-3 text-center leading-relaxed text-amber-800 ring-1 ring-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/50"
      >
        <span
          aria-hidden="true"
          className="block whitespace-nowrap text-[clamp(0.625rem,3.1vw,0.75rem)] xl:hidden"
        >
          {t("downloads.warningShort")}
        </span>
        <span
          aria-hidden="true"
          className="hidden whitespace-nowrap text-xs xl:block"
        >
          {t("downloads.warning")}
        </span>
      </div>

      {previewEnabled && (
        <div className="mb-5 flex min-w-0 items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-blue-600 px-2 text-[10px] font-semibold uppercase tracking-wide text-white"
          >
            {t("downloads.preview.badge")}
          </span>
          <p className="min-w-0 leading-5">
            {t("downloads.preview.description")}
          </p>
        </div>
      )}

      {loading && displayTasks.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          {t("downloads.loading")}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="my-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center dark:border-gray-800 dark:bg-gray-900/30">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-gray-900">
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
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 text-center">
            {filter === "all"
              ? t("downloads.emptyAll")
              : t("downloads.emptyFilter", {
                  status: t(`downloads.status.${filter}`),
                })}
          </h3>
          <p
            className="mb-6 max-w-full overflow-hidden text-center text-gray-500 dark:text-gray-400"
            aria-label={
              filter === "all"
                ? t("downloads.emptyAllDesc")
                : t("downloads.emptyFilterDesc")
            }
            title={
              filter === "all"
                ? t("downloads.emptyAllDesc")
                : t("downloads.emptyFilterDesc")
            }
          >
            {filter === "all" ? (
              <>
                <span
                  aria-hidden="true"
                  className="block whitespace-nowrap text-[clamp(0.625rem,3vw,0.875rem)] xl:hidden"
                >
                  {t("downloads.emptyAllDescShort")}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden whitespace-nowrap text-sm xl:block"
                >
                  {t("downloads.emptyAllDesc")}
                </span>
              </>
            ) : (
              <span className="block whitespace-nowrap text-[clamp(0.625rem,3vw,0.875rem)]">
                {t("downloads.emptyFilterDesc")}
              </span>
            )}
          </p>
          {filter === "all" && (
            <Link
              to="/search"
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
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              {t("downloads.searchApps")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map((task) => (
            <DownloadItem
              key={task.id}
              task={task}
              preview={previewEnabled}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Modal
        open={checkingAll && checkProgress.total > 0}
        onClose={handleCancelCheck}
        title={t("downloads.checkingUpdates")}
      >
        <div className="space-y-4">
          <div className="flex justify-center text-blue-600 dark:text-blue-400">
            <Spinner />
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {checkProgress.appName
                ? `${t("downloads.checkingApp")}${checkProgress.appName}`
                : "..."}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
              {checkProgress.current} / {checkProgress.total}
            </p>
          </div>
          <ProgressBar
            label={t("downloads.checkingUpdates")}
            progress={
              checkProgress.total > 0
                ? (checkProgress.current / checkProgress.total) * 100
                : 0
            }
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            {t("downloads.checkUpdatesDesc")}
          </p>
          <div className="flex justify-center">
            <button
              onClick={handleCancelCheck}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("settings.data.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
