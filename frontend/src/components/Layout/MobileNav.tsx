import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  AccountsIcon,
  DownloadsIcon,
  HomeIcon,
  SearchIcon,
  SettingsIcon,
} from '../common/icons';

const navItems = [
  { to: '/', label: 'home', icon: HomeIcon },
  { to: '/accounts', label: 'accounts', icon: AccountsIcon },
  { to: '/search', label: 'search', icon: SearchIcon },
  { to: '/downloads', label: 'downloads', icon: DownloadsIcon },
  { to: '/settings', label: 'settings', icon: SettingsIcon },
];

export default function MobileNav() {
  const { t } = useTranslation();

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/70 bg-gray-50/84 shadow-[0_-8px_28px_rgba(28,28,30,0.045)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-200 dark:border-gray-800/80 dark:bg-gray-950/84 dark:shadow-[0_-8px_28px_rgba(0,0,0,0.22)] md:hidden">
      <div className="flex h-[3.625rem] items-stretch justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-1 pt-1.5 text-[10px] font-medium leading-none transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="h-[22px] w-[22px] shrink-0" />
            <span className="max-w-full truncate px-1">
              {t(`nav.${item.label}`)}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
