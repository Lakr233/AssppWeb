import { Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "./store/settings";

import Sidebar from "./components/Layout/Sidebar";
import MobileNav from "./components/Layout/MobileNav";
import MobileHeader from "./components/Layout/MobileHeader";
import ToastContainer from "./components/common/ToastContainer";
import GlobalDownloadNotifier from "./components/common/GlobalDownloadNotifier";

const HomePage = lazy(() => import("./components/Welcome/HomePage"));
const AccountList = lazy(() => import("./components/Account/AccountList"));
const AddAccountForm = lazy(
  () => import("./components/Account/AddAccountForm"),
);
const AccountDetail = lazy(() => import("./components/Account/AccountDetail"));
const SearchPage = lazy(() => import("./components/Search/SearchPage"));
const ProductDetail = lazy(() => import("./components/Search/ProductDetail"));
const VersionHistory = lazy(() => import("./components/Search/VersionHistory"));
const DownloadList = lazy(() => import("./components/Download/DownloadList"));
const AddDownload = lazy(() => import("./components/Download/AddDownload"));
const PackageDetail = lazy(() => import("./components/Download/PackageDetail"));
const SettingsPage = lazy(() => import("./components/Settings/SettingsPage"));

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      {t("loading")}
    </div>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);
      if (isDark) {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.style.colorScheme = "light";
      }
    }

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <ToastContainer />
      <GlobalDownloadNotifier />

      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 safe-top">
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
  );
}
