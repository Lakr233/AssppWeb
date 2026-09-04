import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppIcon from '../common/AppIcon';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';
import PackageQuickActions from './PackageQuickActions';
import { formatBytes } from '../../utils/format';
import type { DownloadTask } from '../../types';

interface DownloadItemProps {
  task: DownloadTask;
  preview?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DownloadItem({
  task,
  preview = false,
  onPause,
  onResume,
  onDelete,
}: DownloadItemProps) {
  const { t } = useTranslation();

  const isActive = task.status === 'downloading' || task.status === 'injecting';
  const isPaused = task.status === 'paused';
  const detailsHref = `/downloads/${task.id}${
    preview ? '?preview=downloads' : ''
  }`;

  return (
    <article className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-w-0 items-start gap-3">
        <AppIcon
          url={task.software.artworkUrl}
          name={task.software.name}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                to={detailsHref}
                className="block truncate text-sm font-semibold text-gray-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
              >
                {task.software.name}
              </Link>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {task.software.artistName}
              </p>
            </div>
            <div className="shrink-0 whitespace-nowrap">
              <Badge status={task.status} />
            </div>
          </div>
          <p
            title={task.software.bundleID}
            className="mt-1 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500"
          >
            {task.software.bundleID}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-3 gap-2">
        <SummaryItem
          label={t('downloads.package.version')}
          value={task.software.version}
        />
        <SummaryItem
          label={t('downloads.package.size')}
          value={formatBytes(task.software.fileSizeBytes)}
        />
        <SummaryItem
          label={t('downloads.package.minOs')}
          value={`iOS ${task.software.minimumOsVersion || '—'}`}
        />
      </dl>

      {(isActive || isPaused) && (
        <div className="mt-3">
          <ProgressBar progress={task.progress} label={task.software.name} />
          <div className="mt-1.5 flex min-w-0 justify-between gap-3 text-xs font-medium text-gray-500 dark:text-gray-400">
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
        <p className="mt-3 break-words rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {task.error}
        </p>
      )}

      {task.status === 'completed' && task.hasFile && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <PackageQuickActions task={task} size="compact" />
        </div>
      )}

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
        {isActive ? (
          <button
            type="button"
            onClick={() => onPause(task.id)}
            className="min-h-10 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('downloads.package.pause')}
          </button>
        ) : isPaused ? (
          <button
            type="button"
            onClick={() => onResume(task.id)}
            className="min-h-10 min-w-0 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {t('downloads.package.resume')}
          </button>
        ) : (
          <Link
            to={detailsHref}
            className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('downloads.package.title')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="min-h-10 min-w-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          {t('downloads.package.delete')}
        </button>
      </div>
    </article>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800/60">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd
        title={value}
        className="mt-0.5 truncate text-xs font-medium text-gray-700 dark:text-gray-200"
      >
        {value}
      </dd>
    </div>
  );
}
