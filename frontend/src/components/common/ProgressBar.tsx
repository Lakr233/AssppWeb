interface ProgressBarProps {
  progress: number;
  className?: string;
  label?: string;
}

export default function ProgressBar({
  progress,
  className = '',
  label,
}: ProgressBarProps) {
  const normalized = Number.isFinite(progress) ? progress : 0;
  const clamped = Math.min(100, Math.max(0, normalized));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={`${Math.round(clamped)}%`}
      aria-label={label}
      className={`h-2 w-full overflow-hidden rounded-full bg-gray-200/90 ring-1 ring-black/[0.03] dark:bg-gray-800 dark:ring-white/[0.04] ${className}`}
    >
      <div
        className="h-full rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.25)] transition-[width] duration-500 ease-out dark:bg-blue-500 dark:shadow-[0_0_10px_rgba(59,130,246,0.2)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
