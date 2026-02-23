const styles = {
  error: "bg-red-50 border-red-200 text-red-700",
  success: "bg-green-50 border-green-200 text-green-700",
  warning: "bg-amber-50 border-amber-200 text-amber-700",
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
