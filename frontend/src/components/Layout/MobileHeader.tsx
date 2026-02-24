import { useTranslation } from "react-i18next";
import { SunIcon, MoonIcon, SystemIcon } from "../common/icons";
import { useSettingsStore } from "../../store/settings";

export default function MobileHeader() {
  const { t } = useTranslation();

  return (
    <>
      {/* Use fixed instead of sticky to prevent PWA overscroll gap, with safe-top / 使用 fixed 替代 sticky 防止 PWA 下拉出现空白缝隙，保留 safe-top */}
      <header className="md:hidden fixed top-0 left-0 right-0 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 transition-colors duration-200 safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Asspp Web
          </h1>
          <ThemeToggle />
        </div>
      </header>
      {/* Spacer to occupy the space of the fixed header in the document flow / 为 fixed 定位的顶栏提供占位，防止下方内容被遮挡 */}
      <div className="md:hidden safe-top">
        <div className="h-14"></div>
      </div>
    </>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();
  const { t } = useTranslation();

  const cycleTheme = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 -mr-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      title={t(`theme.${theme}`)}
    >
      {theme === "light" && <SunIcon className="w-5 h-5" />}
      {theme === "dark" && <MoonIcon className="w-5 h-5" />}
      {theme === "system" && <SystemIcon className="w-5 h-5" />}
    </button>
  );
}
