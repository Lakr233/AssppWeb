export default function Spinner() {
  return (
    <svg
      // 这里的 text-white 替换为 text-current，使其能自动继承父元素（比如按钮）的文本颜色，适配性更好
      aria-hidden="true"
      focusable="false"
      className="animate-spin h-4 w-4 text-current"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
