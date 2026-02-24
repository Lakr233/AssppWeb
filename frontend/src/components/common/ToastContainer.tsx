// Updated ToastContainer component to support multi-line text and rich titles
import { useToastStore } from "../../store/toast";

const icons = {
  success: (
    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    // Fixed container at the top right / 固定在右上角的容器
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // Dynamically adjust alignment based on the presence of a title / 根据是否有标题动态调整对齐方式，增加宽度
          className={`pointer-events-auto flex gap-3 px-4 py-4 min-w-[320px] max-w-md rounded-xl backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 border border-gray-200/50 dark:border-gray-700/50 shadow-2xl transform transition-all duration-300 translate-y-0 opacity-100 ${
            toast.title ? "items-start" : "items-center"
          }`}
        >
          <div className={`${toast.title ? "mt-0.5" : ""} flex-shrink-0`}>
            {icons[toast.type]}
          </div>
          <div className="flex-1 min-w-0">
            {toast.title && (
              <h4
                className={`text-sm font-bold mb-1 ${
                  toast.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : toast.type === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-blue-600 dark:text-blue-400"
                }`}
              >
                {toast.title}
              </h4>
            )}
            <p
              className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-pre-line break-words ${
                toast.title ? "leading-relaxed" : ""
              }`}
            >
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 ${
              toast.title ? "mt-0.5" : ""
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}