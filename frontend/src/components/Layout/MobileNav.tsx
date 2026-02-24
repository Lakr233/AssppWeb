import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HomeIcon,
  AccountsIcon,
  SearchIcon,
  DownloadsIcon,
  SettingsIcon,
} from "../common/icons";

const navItems = [
  { to: "/", label: "home", icon: HomeIcon },
  { to: "/accounts", label: "accounts", icon: AccountsIcon },
  { to: "/search", label: "search", icon: SearchIcon },
  { to: "/downloads", label: "downloads", icon: DownloadsIcon },
  { to: "/settings", label: "settings", icon: SettingsIcon },
];

export default function MobileNav() {
  const { t } = useTranslation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-bottom transition-colors duration-200">
      <div className="flex justify-around items-center h-14">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                isActive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{t(`nav.${item.label}`)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
