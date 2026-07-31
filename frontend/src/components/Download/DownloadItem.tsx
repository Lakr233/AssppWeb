import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../common/AppIcon";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import type { DownloadTask } from "../../types";

interface DownloadItemProps {
  task: DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DownloadItem({
  task,
  onPause,
  onResume,
  onDelete,
}: DownloadItemProps) {
  const { t } = useTranslation();

  const isActive = task.status === "downloading" || task.status === "injecting";
  const isPaused = task.status === "paused";
  const isCompleted = task.status === "completed";

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
      <div className="flex gap-3">
        <AppIcon
          url={task.software.artworkUrl}
          name={task.software.name}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          {/* Added gap-3 and items-start to prevent layout shifting, set title container to flex-1 min-w-0 */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                to={`/downloads/${task.id}`}
                className="block truncate text-sm font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
              >
                {task.software.name}
              </Link>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                v{task.software.version}
              </p>
            </div>
            {/* Wrapped Badge with shrink-0 and whitespace-nowrap to prevent squeezing and text wrapping */}
            <div className="shrink-0 whitespace-nowrap flex items-center h-5 mt-0.5">
              <Badge status={task.status} />
            </div>
          </div>

          {(isActive || isPaused) && (
            <div className="mt-2.5">
              <ProgressBar
                progress={task.progress}
                label={task.software.name}
              />
              <div className="flex justify-between mt-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>{Math.round(task.progress)}%</span>
                {task.speed && isActive && (
                  <span className="max-w-[55%] truncate text-right">
                    {task.speed}
                  </span>
                )}
              </div>
            </div>
          )}

          {task.error && (
            <p className="mt-2 break-words rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {task.error}
            </p>
          )}

          {/* Redesigned action buttons with borders, padding, rounded corners, and shadow */}
          <div className="flex flex-wrap gap-2 mt-3">
            {isActive && (
              <button
                onClick={() => onPause(task.id)}
                className="rounded-full bg-gray-100 px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("downloads.package.pause")}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => onResume(task.id)}
                className="rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-950"
              >
                {t("downloads.package.resume")}
              </button>
            )}
            {isCompleted && task.hasFile && (
              <Link
                to={`/downloads/${task.id}`}
                className="inline-flex items-center justify-center rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-950"
              >
                {t("downloads.item.viewPackage")}
              </Link>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="rounded-full bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
            >
              {t("downloads.package.delete")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
