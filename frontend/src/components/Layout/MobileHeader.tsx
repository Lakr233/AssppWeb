import { useTranslation } from "react-i18next";
import { SunIcon, MoonIcon, SystemIcon } from "../common/icons";
import { useSettingsStore } from "../../store/settings";

export default function MobileHeader() {
  const { t } = useTranslation();

  return (
    <header className="md:hidden sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 transition-colors duration-200">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          Asspp Web
        </h1>
        <ThemeToggle />
      </div>
    </header>
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
