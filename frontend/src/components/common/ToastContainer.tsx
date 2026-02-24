import { useToastStore } from "../../store/toast";

const icons = {
  success: (
    // Enlarged icon for better visual impact / 稍微放大图标以提供更好的视觉效果
    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    // Enlarged icon for better visual impact / 稍微放大图标以提供更好的视觉效果
    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    // Enlarged icon for better visual impact / 稍微放大图标以提供更好的视觉效果
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          // Added overflow-hidden to accommodate the separated left icon section properly / 增加了 overflow-hidden 确保左侧独立的背景区域不会溢出圆角
          className={`pointer-events-auto flex min-w-[320px] max-w-md overflow-hidden rounded-xl backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 border border-gray-200/50 dark:border-gray-700/50 shadow-2xl transform transition-all duration-300 translate-y-0 opacity-100`}
        >
          {/* Separated left icon area with subtle background, vertically centered / 独立的左侧图标区域，带有微弱背景色且垂直居中 */}
          <div
            className={`flex items-center justify-center w-14 flex-shrink-0 ${
              toast.type === "success"
                ? "bg-green-50 dark:bg-green-900/20"
                : toast.type === "error"
                ? "bg-red-50 dark:bg-red-900/20"
                : "bg-blue-50 dark:bg-blue-900/20"
            }`}
          >
            {icons[toast.type]}
          </div>

          {/* Text content area, flex-1 ensures it takes remaining space / 文本内容区域，flex-1 确保占据剩余空间 */}
          <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center">
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

          {/* Close button area, aligned to top-right / 关闭按钮区域，对齐到右上角 */}
          <div className="flex items-start pt-3 pr-3">
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}