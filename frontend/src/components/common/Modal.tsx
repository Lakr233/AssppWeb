export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
