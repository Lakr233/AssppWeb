import { useTranslation } from "react-i18next";

interface BadgeProps {
  status:
    | "pending"
    | "downloading"
    | "paused"
    | "injecting"
    | "completed"
    | "failed";
}

const styles: Record<BadgeProps["status"], string> = {
  pending: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
  downloading:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  paused:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  injecting:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  completed:
    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

export default function Badge({ status }: BadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {/* Dynamic lookup matching the JSON structure "downloads.status.xxx" */}
      {t(`downloads.status.${status}`)}
    </span>
  );
}
