import { useState } from 'react';

interface AppIconProps {
  url?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
};

const surfaceClassName =
  'shrink-0 rounded-[22%] ring-1 ring-black/5 shadow-sm shadow-gray-950/10 dark:ring-white/10 dark:shadow-black/30';

export default function AppIcon({ url, name, size = 'md' }: AppIconProps) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={`${sizeClasses[size]} ${surfaceClassName} flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white`}
        role="img"
        aria-label={name}
      >
        <span aria-hidden="true" className="text-lg font-semibold">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      className={`${sizeClasses[size]} ${surfaceClassName} object-cover`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
