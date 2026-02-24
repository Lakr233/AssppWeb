import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import DownloadItem from "./DownloadItem";
import { useDownloads } from "../../hooks/useDownloads";
import { useAccounts } from "../../hooks/useAccounts";
import { useToastStore } from "../../store/toast";
import { getAccountContext } from "../../utils/toast";
import type { DownloadTask } from "../../types";

type StatusFilter = "all" | DownloadTask["status"];

export default function DownloadList() {
  const { t } = useTranslation();
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

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const sortedTasks = [...filtered].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  function handleDelete(id: string) {
    if (!confirm(t("downloads.deleteConfirm"))) return;

    const task = tasks.find((t) => t.id === id);
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

  return (
    <PageContainer
      title={t("downloads.title")}
      action={
        <Link
          to="/downloads/add"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t("downloads.new")}
        </Link>
      }
    >
      <div className="mb-4 flex gap-2 flex-wrap">
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
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t(`downloads.status.${status}`)}
            {status !== "all" && (
              <span className="ml-1">
                ({tasks.filter((t) => t.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
        {t("downloads.warning")}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          {t("downloads.loading")}
        </div>
      ) : sortedTasks.length === 0 ? (
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-sm">
            {filter === "all"
              ? t("downloads.emptyAllDesc")
              : t("downloads.emptyFilterDesc")}
          </p>
          {filter === "all" && (
            <Link
              to="/search"
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
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              {t("downloads.searchApps")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <DownloadItem
              key={task.id}
              task={task}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
