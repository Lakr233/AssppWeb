import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HomeIcon,
  AccountsIcon,
  SearchIcon,
  DownloadsIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  SystemIcon,
} from "../common/icons";
import { useSettingsStore } from "../../store/settings";

const navItems = [
  { to: "/", label: "home", icon: HomeIcon },
  { to: "/accounts", label: "accounts", icon: AccountsIcon },
  { to: "/search", label: "search", icon: SearchIcon },
  { to: "/downloads", label: "downloads", icon: DownloadsIcon },
  { to: "/settings", label: "settings", icon: SettingsIcon },
];

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 transition-colors duration-200">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Asspp Web
        </h1>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {t(`nav.${item.label}`)}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <ThemeToggle />
      </div>
    </aside>
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
      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
      title={t(`theme.${theme}`)}
    >
      {theme === "light" && <SunIcon className="w-5 h-5" />}
      {theme === "dark" && <MoonIcon className="w-5 h-5" />}
      {theme === "system" && <SystemIcon className="w-5 h-5" />}
      <span>{t(`theme.${theme}`)}</span>
    </button>
  );
}
