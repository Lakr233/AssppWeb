import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import MobileHeader from './components/Layout/MobileHeader';
import MobileNav from './components/Layout/MobileNav';
import Sidebar from './components/Layout/Sidebar';
import GlobalDownloadNotifier from './components/common/GlobalDownloadNotifier';
import ToastContainer from './components/common/ToastContainer';
import PasswordGate from './components/Auth/PasswordGate';
import { useSettingsStore } from './store/settings';

const HomePage = lazy(() => import('./components/Welcome/HomePage'));
const AccountList = lazy(() => import('./components/Account/AccountList'));
const AddAccountForm = lazy(
  () => import('./components/Account/AddAccountForm'),
);
const AccountDetail = lazy(() => import('./components/Account/AccountDetail'));
const SearchPage = lazy(() => import('./components/Search/SearchPage'));
const ProductDetail = lazy(() => import('./components/Search/ProductDetail'));
const VersionHistory = lazy(() => import('./components/Search/VersionHistory'));
const DownloadList = lazy(() => import('./components/Download/DownloadList'));
const AddDownload = lazy(() => import('./components/Download/AddDownload'));
const PackageDetail = lazy(() => import('./components/Download/PackageDetail'));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'));

function Loading() {
  const { t } = useTranslation();

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center px-6"
      role="status"
    >
      <div className="inline-flex items-center gap-2.5 rounded-full border border-gray-200/80 bg-white/90 px-4 py-2.5 text-sm font-medium text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900/90 dark:text-gray-400">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600/25 border-t-blue-600 dark:border-blue-500/25 dark:border-t-blue-500"
        />
        {t('loading')}
      </div>
    </div>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      const isDark =
        theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    }

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  return (
    <PasswordGate>
      <div className="flex h-screen h-[100dvh] overflow-hidden bg-gray-50 text-gray-900 selection:bg-blue-200 dark:bg-gray-950 dark:text-gray-100 dark:selection:bg-blue-800">
        <ToastContainer />
        <GlobalDownloadNotifier />

        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:pt-[env(safe-area-inset-top)]">
          <MobileHeader />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/accounts" element={<AccountList />} />
              <Route path="/accounts/add" element={<AddAccountForm />} />
              <Route path="/accounts/:email" element={<AccountDetail />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/search/:appId" element={<ProductDetail />} />
              <Route
                path="/search/:appId/versions"
                element={<VersionHistory />}
              />
              <Route path="/downloads" element={<DownloadList />} />
              <Route path="/downloads/add" element={<AddDownload />} />
              <Route path="/downloads/:id" element={<PackageDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
        <MobileNav />
      </div>
    </PasswordGate>
  );
}
