import { useState } from "react";

interface AppIconProps {
  url?: string;
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-10 h-10 rounded-lg",
  md: "w-14 h-14 rounded-xl",
  lg: "w-20 h-20 rounded-2xl",
};

export default function AppIcon({ url, name, size = "md" }: AppIconProps) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={`${sizeClasses[size]} bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 font-bold`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      className={`${sizeClasses[size]} object-cover`}
      onError={() => setFailed(true)}
    />
  );
}
