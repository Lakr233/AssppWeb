// Import useTranslation hook
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
  pending: "bg-gray-100 text-gray-700",
  downloading: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  injecting: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function Badge({ status }: BadgeProps) {
  // Initialize translation hook
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
