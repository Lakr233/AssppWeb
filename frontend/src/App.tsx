import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
// Import useTranslation hook for i18n support
import { useTranslation } from "react-i18next";

import Sidebar from "./components/Layout/Sidebar";
import MobileNav from "./components/Layout/MobileNav";

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
  // Initialize the translation hook
  const { t } = useTranslation();
  
  // Use the translation key "loading" from our JSON files
  return <div className="p-8 text-center text-gray-500">{t("loading")}</div>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <main className="flex-1 min-w-0 safe-top">
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
