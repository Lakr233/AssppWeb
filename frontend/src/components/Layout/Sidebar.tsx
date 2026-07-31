import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  AccountsIcon,
  DownloadsIcon,
  HomeIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  SystemIcon,
} from '../common/icons';
import { useSettingsStore } from '../../store/settings';

const navItems = [
  { to: '/', label: 'home', icon: HomeIcon },
  { to: '/accounts', label: 'accounts', icon: AccountsIcon },
  { to: '/search', label: 'search', icon: SearchIcon },
  { to: '/downloads', label: 'downloads', icon: DownloadsIcon },
  { to: '/settings', label: 'settings', icon: SettingsIcon },
];

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="sticky top-0 z-30 hidden h-screen h-[100dvh] w-[17rem] flex-col border-r border-gray-200/80 bg-white/75 shadow-[1px_0_0_rgba(255,255,255,0.7),8px_0_32px_rgba(28,28,30,0.035)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-200 dark:border-gray-800/80 dark:bg-gray-900/80 dark:shadow-[1px_0_0_rgba(255,255,255,0.025),8px_0_32px_rgba(0,0,0,0.15)] md:flex">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <img
            src="/icon-192x192.png"
            alt=""
            className="h-10 w-10 rounded-[11px] shadow-[0_2px_8px_rgba(0,0,0,0.14)] ring-1 ring-black/5 dark:ring-white/10"
          />
          <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-gray-900 dark:text-white">
            Asspp Web
          </h1>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-[0_5px_14px_rgba(0,122,255,0.22)] dark:bg-blue-500 dark:shadow-[0_5px_18px_rgba(10,132,255,0.18)]'
                  : 'text-gray-600 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/75 dark:hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {t(`nav.${item.label}`)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-200/70 p-3 dark:border-gray-800/80">
        <ThemeToggle />
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();
  const { t } = useTranslation();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-gray-200/80 bg-white/60 px-3.5 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900 dark:border-gray-800 dark:bg-gray-800/55 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      title={t(`theme.${theme}`)}
    >
      {theme === 'light' && <SunIcon className="h-5 w-5" />}
      {theme === 'dark' && <MoonIcon className="h-5 w-5" />}
      {theme === 'system' && <SystemIcon className="h-5 w-5" />}
      <span>{t(`theme.${theme}`)}</span>
    </button>
  );
}
