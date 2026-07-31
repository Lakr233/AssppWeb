import { useTranslation } from 'react-i18next';

interface BadgeProps {
  status:
    | 'pending'
    | 'downloading'
    | 'paused'
    | 'injecting'
    | 'completed'
    | 'failed';
}

const styles: Record<BadgeProps['status'], string> = {
  pending:
    'border-gray-200 bg-gray-100/80 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  downloading:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/60 dark:text-blue-300',
  paused:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/60 dark:text-amber-300',
  injecting:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/80 dark:bg-purple-950/60 dark:text-purple-300',
  completed:
    'border-green-200 bg-green-50 text-green-700 dark:border-green-900/80 dark:bg-green-950/60 dark:text-green-300',
  failed:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/80 dark:bg-red-950/60 dark:text-red-300',
};

const dotStyles: Record<BadgeProps['status'], string> = {
  pending: 'bg-gray-400 dark:bg-gray-500',
  downloading: 'bg-blue-500 dark:bg-blue-400',
  paused: 'bg-amber-500 dark:bg-amber-400',
  injecting: 'bg-purple-500 dark:bg-purple-400',
  completed: 'bg-green-500 dark:bg-green-400',
  failed: 'bg-red-500 dark:bg-red-400',
};

export default function Badge({ status }: BadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${styles[status]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`}
      />
      {t(`downloads.status.${status}`)}
    </span>
  );
}
