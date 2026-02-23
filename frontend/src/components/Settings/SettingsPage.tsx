import { useState, useEffect, useRef } from "react";
// Import useTranslation hook
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import { countryCodeMap } from "../../apple/config";
import { useAccountsStore } from "../../store/accounts";
import { encryptData, decryptData } from "../../utils/crypto";
import type { Account } from "../../types";

interface ServerInfo {
  version?: string;
  uptime?: number;
  dataDir?: string;
}

const entityTypes = [
  { value: "software", label: "iPhone" },
  { value: "iPadSoftware", label: "iPad" },
];

export default function SettingsPage() {
  // Initialize translation hook and i18n instance
  const { t, i18n } = useTranslation();
  // Get accounts and store methods to interact with IndexedDB locally
  const { accounts, addAccount, updateAccount } = useAccountsStore();
  
  const [country, setCountry] = useState(
    () => localStorage.getItem("asspp-default-country") || "US",
  );
  const [entity, setEntity] = useState(
    () => localStorage.getItem("asspp-default-entity") || "software",
  );
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  // States for Export feature
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirmPassword, setExportConfirmPassword] = useState("");
  const [exportError, setExportError] = useState("");

  // States for Import feature
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importError, setImportError] = useState("");
  const [importFileData, setImportFileData] = useState("");

  // States for Import Conflict Resolution
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingAccounts, setPendingAccounts] = useState<Account[]>([]);
  const [conflictStats, setConflictStats] = useState({ conflict: 0, new: 0 });

  useEffect(() => {
    localStorage.setItem("asspp-default-country", country);
  }, [country]);

  useEffect(() => {
    localStorage.setItem("asspp-default-entity", entity);
  }, [entity]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then(setServerInfo)
      .catch(() => setServerInfo(null));
  }, []);

  // Sort countries dynamically based on the translated names of the current language
  const sortedCountries = Object.keys(countryCodeMap).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  // Handle Export File Generation
  const handleExport = async () => {
    if (exportPassword !== exportConfirmPassword) {
      setExportError(t("settings.data.passwordMismatch"));
      return;
    }
    try {
      // Encrypt accounts array
      const encrypted = await encryptData(accounts, exportPassword);
      const blob = new Blob([encrypted], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "asspp-accounts.enc";
      a.click();
      URL.revokeObjectURL(url);
      
      setExportModalOpen(false);
      setExportPassword("");
      setExportConfirmPassword("");
      setExportError("");
      alert(t("settings.data.exportSuccess"));
    } catch (e) {
      setExportError("Export failed.");
    }
  };

  // Triggered when user selects a file from the hidden input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportFileData(content);
      setImportModalOpen(true);
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    e.target.value = "";
  };

  // Handle Import Decryption and Conflict Detection
  const handleImport = async () => {
    try {
      const parsed = await decryptData(importFileData, importPassword);
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      
      if (accounts.length === 0) {
        // Safe sequential addition to prevent state clobbering
        for (const acc of parsed) {
          await addAccount(acc);
        }
        alert(t("settings.data.importSuccess"));
        setImportModalOpen(false);
        setImportPassword("");
        setImportError("");
      } else {
        // Detect duplicates
        let conflictCount = 0;
        let newCount = 0;
        parsed.forEach(imported => {
          if (accounts.some(a => a.email === imported.email)) conflictCount++;
          else newCount++;
        });

        if (conflictCount > 0) {
          setConflictStats({ conflict: conflictCount, new: newCount });
          setPendingAccounts(parsed);
          setImportModalOpen(false);
          setImportPassword("");
          setImportError("");
          setConflictModalOpen(true); // Open conflict resolution modal
        } else {
          for (const acc of parsed) {
            await addAccount(acc);
          }
          alert(t("settings.data.importSuccess"));
          setImportModalOpen(false);
          setImportPassword("");
          setImportError("");
        }
      }
    } catch (e) {
      setImportError(t("settings.data.incorrectPassword"));
    }
  };

  // Handle specific resolution chosen by user (Overwrite vs Skip)
  const handleResolveConflict = async (overwrite: boolean) => {
    for (const imported of pendingAccounts) {
      const exists = accounts.some(a => a.email === imported.email);
      if (exists) {
        if (overwrite) await updateAccount(imported); // Replace local
      } else {
        await addAccount(imported); // Always add new ones
      }
    }
    setConflictModalOpen(false);
    setPendingAccounts([]);
    alert(t("settings.data.importSuccess"));
  };

  return (
    <PageContainer title={t("settings.title")}>
      <div className="space-y-6">
        
        {/* Language Selection Section */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.language.title")}</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="language"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("settings.language.label")}
              </label>
              <select
                id="language"
                value={i18n.language.split("-")[0]} // Normalizes en-US to en
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="zh">简体中文</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.defaults.title")}</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="country"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("settings.defaults.country")}
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {sortedCountries.map((code) => (
                  <option key={code} value={code}>
                    {t(`countries.${code}`, code)} ({code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="entity"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("settings.defaults.entity")}
              </label>
              <select
                id="entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {entityTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.server.title")}</h2>
          {serverInfo ? (
            <dl className="space-y-3">
              {serverInfo.version && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">{t("settings.server.version")}</dt>
                  <dd className="text-sm text-gray-900">
                    {serverInfo.version}
                  </dd>
                </div>
              )}
              {serverInfo.dataDir && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    {t("settings.server.dataDir")}
                  </dt>
                  <dd className="text-sm text-gray-900 font-mono">
                    {serverInfo.dataDir}
                  </dd>
                </div>
              )}
              {serverInfo.uptime != null && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">{t("settings.server.uptime")}</dt>
                  <dd className="text-sm text-gray-900">
                    {formatUptime(serverInfo.uptime)}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-500">
              {t("settings.server.offline")}
            </p>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.data.title")}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {t("settings.data.description")}
          </p>

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => {
                setExportModalOpen(true);
                setExportError("");
              }}
              className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {t("settings.data.exportBtn")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium text-green-600 border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
            >
              {t("settings.data.importBtn")}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".enc"
              onChange={handleFileSelect}
            />
          </div>

          <button
            onClick={() => {
              if (!confirm(t("settings.data.confirm"))) return;
              localStorage.clear();
              indexedDB.deleteDatabase("asspp-accounts");
              window.location.href = "/";
            }}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            {t("settings.data.button")}
          </button>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("settings.about.title")}</h2>
          <p className="text-sm text-gray-600">
            {t("settings.about.description")}
          </p>
          <p className="mt-2 text-xs text-gray-400">v0.0.1</p>
        </section>
      </div>

      {/* Export Password Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">{t("settings.data.exportBtn")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.data.passwordPrompt")}</label>
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.data.passwordConfirm")}</label>
                <input
                  type="password"
                  value={exportConfirmPassword}
                  onChange={(e) => setExportConfirmPassword(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {exportError && <p className="text-sm text-red-600">{exportError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("settings.data.cancel")}
              </button>
              <button
                onClick={handleExport}
                disabled={!exportPassword || !exportConfirmPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t("settings.data.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Password Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">{t("settings.data.importBtn")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("settings.data.passwordPrompt")}</label>
                <input
                  type="password"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {importError && <p className="text-sm text-red-600">{importError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("settings.data.cancel")}
              </button>
              <button
                onClick={handleImport}
                disabled={!importPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t("settings.data.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Conflict Resolution Modal */}
      {conflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">{t("settings.data.conflictTitle")}</h3>
            <p className="text-sm text-gray-700 mb-6">
              {t("settings.data.conflictDesc", { conflict: conflictStats.conflict, new: conflictStats.new })}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleResolveConflict(true)}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                {t("settings.data.conflictOverwrite")}
              </button>
              <button
                onClick={() => handleResolveConflict(false)}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("settings.data.conflictSkip")}
              </button>
              <button
                onClick={() => setConflictModalOpen(false)}
                className="w-full px-4 py-2 text-sm font-medium text-blue-600 mt-2"
              >
                {t("settings.data.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
