const styles = {
  error:
    "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400",
  success:
    "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400",
  warning:
    "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400",
} as const;

export default function Alert({
  type,
  children,
  className = "",
}: {
  type: keyof typeof styles;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-3 border rounded-lg text-sm ${styles[type]} ${className}`}
    >
      {children}
    </div>
  );
}
