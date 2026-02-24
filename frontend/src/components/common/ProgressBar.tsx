interface ProgressBarProps {
  progress: number;
  className?: string;
}

export default function ProgressBar({
  progress,
  className = "",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div
      className={`w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 ${className}`}
    >
      <div
        className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
