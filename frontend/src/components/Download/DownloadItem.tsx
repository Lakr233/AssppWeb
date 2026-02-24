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
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
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
                className="font-medium text-sm text-gray-900 dark:text-white truncate block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
              <ProgressBar progress={task.progress} />
              <div className="flex justify-between mt-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>{Math.round(task.progress)}%</span>
                {task.speed && isActive && <span>{task.speed}</span>}
              </div>
            </div>
          )}

          {task.error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-md border border-red-100 dark:border-red-900/30">
              {task.error}
            </p>
          )}

          {/* Redesigned action buttons with borders, padding, rounded corners, and shadow */}
          <div className="flex flex-wrap gap-2 mt-3">
            {isActive && (
              <button
                onClick={() => onPause(task.id)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
              >
                {t("downloads.package.pause")}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => onResume(task.id)}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800/60 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-sm transition-colors"
              >
                {t("downloads.package.resume")}
              </button>
            )}
            {isCompleted && task.hasFile && (
              <Link
                to={`/downloads/${task.id}`}
                className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800/60 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-sm transition-colors"
              >
                {t("downloads.item.viewPackage")}
              </Link>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800/50 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-colors"
            >
              {t("downloads.package.delete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
