import { useTranslation } from 'react-i18next';
import { MoonIcon, SunIcon, SystemIcon } from '../common/icons';
import { useSettingsStore } from '../../store/settings';

export default function MobileHeader() {
  const { t } = useTranslation();

  return (
    <>
      {/* Use fixed instead of sticky to prevent PWA overscroll gap, with safe-top / 使用 fixed 替代 sticky 防止 PWA 下拉出现空白缝隙，保留 safe-top */}
      <header className="safe-top fixed left-0 right-0 top-0 z-40 w-full border-b border-gray-200/70 bg-gray-50/82 shadow-[0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-200 dark:border-gray-800/80 dark:bg-gray-950/82 dark:shadow-[0_1px_0_rgba(255,255,255,0.025)] md:hidden">
        <div className="grid h-14 grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 px-4">
          <img
            src="/icon-192x192.png"
            alt=""
            className="h-7 w-7 rounded-[8px] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          />
          <h1 className="truncate text-center text-[17px] font-semibold tracking-[-0.015em] text-gray-900 dark:text-white">
            Asspp Web
          </h1>
          <ThemeToggle />
        </div>
      </header>
      {/* Spacer to occupy the space of the fixed header in the document flow / 为 fixed 定位的顶栏提供占位，防止下方内容被遮挡 */}
      <div className="md:hidden safe-top">
        <div className="h-14" />
      </div>
    </>
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
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-blue-600 shadow-sm ring-1 ring-gray-200/70 transition-colors hover:bg-white active:bg-gray-100 dark:bg-gray-800/75 dark:text-blue-400 dark:ring-gray-700/80 dark:hover:bg-gray-800 dark:active:bg-gray-700"
      title={t(`theme.${theme}`)}
    >
      {theme === 'light' && <SunIcon className="h-[18px] w-[18px]" />}
      {theme === 'dark' && <MoonIcon className="h-[18px] w-[18px]" />}
      {theme === 'system' && <SystemIcon className="h-[18px] w-[18px]" />}
    </button>
  );
}
