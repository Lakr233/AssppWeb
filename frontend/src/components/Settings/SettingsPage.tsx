import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import Modal from "../common/Modal";
import { useAccountsStore } from "../../store/accounts";
import { useToastStore } from "../../store/toast";
import { encryptData, decryptData } from "../../utils/crypto";
import { countryCodeMap } from "../../apple/config";
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
  const { t, i18n } = useTranslation();
  const { accounts, addAccount, updateAccount } = useAccountsStore();
  const addToast = useToastStore((s) => s.addToast);

  const [country, setCountry] = useState(
    () => localStorage.getItem("asspp-default-country") || "US",
  );
  const [entity, setEntity] = useState(
    () => localStorage.getItem("asspp-default-entity") || "software",
  );
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirmPassword, setExportConfirmPassword] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importFileData, setImportFileData] = useState("");

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

  const sortedCountries = Object.keys(countryCodeMap).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  const handleExport = async () => {
    if (exportPassword !== exportConfirmPassword) {
      addToast(t("settings.data.passwordMismatch"), "error");
      return;
    }
    try {
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
      addToast(t("settings.data.exportSuccess"), "success");
    } catch {
      addToast(t("settings.data.exportFailed"), "error");
    }
  };

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
    e.target.value = "";
  };

  const handleImport = async () => {
    try {
      const parsed = await decryptData(importFileData, importPassword);
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      const valid = parsed.filter(
        (item: any) =>
          item &&
          typeof item === "object" &&
          typeof item.email === "string" &&
          item.email.length > 0,
      ) as Account[];
      if (valid.length === 0) throw new Error("No valid accounts found");

      if (accounts.length === 0) {
        for (const acc of valid) {
          await addAccount(acc);
        }
        addToast(t("settings.data.importSuccess"), "success");
        setImportModalOpen(false);
        setImportPassword("");
      } else {
        let conflictCount = 0;
        let newCount = 0;
        valid.forEach((imported) => {
          if (accounts.some((a) => a.email === imported.email)) conflictCount++;
          else newCount++;
        });

        if (conflictCount > 0) {
          setConflictStats({ conflict: conflictCount, new: newCount });
          setPendingAccounts(valid);
          setImportModalOpen(false);
          setImportPassword("");
          setConflictModalOpen(true);
        } else {
          for (const acc of valid) {
            await addAccount(acc);
          }
          addToast(t("settings.data.importSuccess"), "success");
          setImportModalOpen(false);
          setImportPassword("");
        }
      }
    } catch {
      addToast(t("settings.data.incorrectPassword"), "error");
    }
  };

  const handleResolveConflict = async (overwrite: boolean) => {
    for (const imported of pendingAccounts) {
      const exists = accounts.some((a) => a.email === imported.email);
      if (exists) {
        if (overwrite) await updateAccount(imported);
      } else {
        await addAccount(imported);
      }
    }
    setConflictModalOpen(false);
    setPendingAccounts([]);
    addToast(t("settings.data.importSuccess"), "success");
  };

  return (
    <PageContainer title={t("settings.title")}>
      <div className="space-y-6">
        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("settings.language.title")}
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="language"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t("settings.language.label")}
              </label>
              <select
                id="language"
                value={i18n.resolvedLanguage || "en-US"}
                onChange={async (e) => {
                  const newLang = e.target.value;
                  await i18n.changeLanguage(newLang);
                  addToast(t("settings.language.changed"), "success");
                }}
                className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="en-US">English (US)</option>
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("settings.defaults.title")}
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="country"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t("settings.defaults.country")}
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  addToast(t("settings.defaults.countryChanged"), "success");
                }}
                className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
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
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t("settings.defaults.entity")}
              </label>
              <select
                id="entity"
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  addToast(t("settings.defaults.entityChanged"), "success");
                }}
                className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                {entityTypes.map((et) => (
                  <option key={et.value} value={et.value}>
                    {et.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("settings.server.title")}
          </h2>
          {serverInfo ? (
            <dl className="space-y-3">
              {serverInfo.version && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t("settings.server.version")}
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-200">
                    {serverInfo.version}
                  </dd>
                </div>
              )}
              {serverInfo.dataDir && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t("settings.server.dataDir")}
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                    {serverInfo.dataDir}
                  </dd>
                </div>
              )}
              {serverInfo.uptime != null && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t("settings.server.uptime")}
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-200">
                    {formatUptime(serverInfo.uptime)}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("settings.server.offline")}
            </p>
          )}
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("settings.data.title")}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t("settings.data.description")}
          </p>

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => setExportModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              {t("settings.data.exportBtn")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400 border border-green-300 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
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
              addToast(t("settings.data.cleared"), "success");
              setTimeout(() => {
                window.location.href = "/";
              }, 1000);
            }}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            {t("settings.data.button")}
          </button>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t("settings.about.title")}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("settings.about.description")}
          </p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            v0.0.1
          </p>
        </section>
      </div>

      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title={t("settings.data.exportBtn")}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.data.passwordPrompt")}
            </label>
            <input
              type="password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.data.passwordConfirm")}
            </label>
            <input
              type="password"
              value={exportConfirmPassword}
              onChange={(e) => setExportConfirmPassword(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setExportModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t("settings.data.cancel")}
          </button>
          <button
            onClick={handleExport}
            disabled={!exportPassword || !exportConfirmPassword}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("settings.data.confirmBtn")}
          </button>
        </div>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={t("settings.data.importBtn")}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("settings.data.passwordPrompt")}
            </label>
            <input
              type="password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setImportModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t("settings.data.cancel")}
          </button>
          <button
            onClick={handleImport}
            disabled={!importPassword}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("settings.data.confirmBtn")}
          </button>
        </div>
      </Modal>

      <Modal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        title={t("settings.data.conflictTitle")}
      >
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
          {t("settings.data.conflictDesc", {
            conflict: conflictStats.conflict,
            new: conflictStats.new,
          })}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleResolveConflict(true)}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            {t("settings.data.conflictOverwrite")}
          </button>
          <button
            onClick={() => handleResolveConflict(false)}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t("settings.data.conflictSkip")}
          </button>
          <button
            onClick={() => setConflictModalOpen(false)}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 mt-2 transition-colors"
          >
            {t("settings.data.cancel")}
          </button>
        </div>
      </Modal>
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
