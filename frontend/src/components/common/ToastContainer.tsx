import type { ReactNode } from "react";
import { useToastStore, type ToastType } from "../../store/toast";

const iconBg: Record<ToastType, string> = {
  success: "bg-green-50 dark:bg-green-900/20",
  error: "bg-red-50 dark:bg-red-900/20",
  info: "bg-blue-50 dark:bg-blue-900/20",
};

const titleColor: Record<ToastType, string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-blue-600 dark:text-blue-400",
};

const icons: Record<ToastType, ReactNode> = {
  success: (
    <svg
      className="w-6 h-6 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  error: (
    <svg
      className="w-6 h-6 text-red-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
  info: (
    <svg
      className="w-6 h-6 text-blue-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <>
      <style>
        {`
          @keyframes toast-slide-in {
            from { transform: translateX(120%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
          .animate-toast-in {
            animation: toast-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        `}
      </style>

      <div
        className="fixed top-[calc(env(safe-area-inset-top)+4rem)] md:top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className="pointer-events-auto flex w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-[calc(100vw-2rem)] sm:max-w-md overflow-hidden rounded-xl backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 border border-gray-200/50 dark:border-gray-700/50 shadow-2xl animate-toast-in"
          >
            <div
              className={`flex items-center justify-center w-14 flex-shrink-0 ${iconBg[toast.type]}`}
            >
              {icons[toast.type]}
            </div>

            <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center">
              {toast.title && (
                <h4
                  className={`text-sm font-bold mb-1 ${titleColor[toast.type]}`}
                >
                  {toast.title}
                </h4>
              )}
              <p
                className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-pre-line break-words ${toast.title ? "leading-relaxed" : ""}`}
              >
                {toast.message}
              </p>
            </div>

            <div className="flex items-start pt-3 pr-3">
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                aria-label="Close notification"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
