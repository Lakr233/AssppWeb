import { useState } from "react";
import { Link } from "react-router-dom";
// Import useTranslation hook
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import DownloadItem from "./DownloadItem";
import { useDownloads } from "../../hooks/useDownloads";
import type { DownloadTask } from "../../types";

type StatusFilter = "all" | DownloadTask["status"];

export default function DownloadList() {
  // Initialize translation hook
  const { t } = useTranslation();
  const { tasks, loading, pauseDownload, resumeDownload, deleteDownload } =
    useDownloads();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const sortedTasks = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      downloading: 0,
      injecting: 1,
      pending: 2,
      paused: 3,
      completed: 4,
      failed: 5,
    };
    return (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
  });

  function handleDelete(id: string) {
    if (!confirm(t("downloads.deleteConfirm"))) return;
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
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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

      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        {t("downloads.warning")}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          {t("downloads.loading")}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {filter === "all" ? t("downloads.emptyAll") : t("downloads.emptyFilter", { status: t(`downloads.status.${filter}`) })}
          </p>
          {filter === "all" && (
            <Link
              to="/search"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
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
