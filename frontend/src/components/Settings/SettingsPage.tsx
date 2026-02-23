import { useState, useEffect } from "react";
// Import useTranslation hook
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import { countryCodeMap } from "../../apple/config";

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
  
  const [country, setCountry] = useState(
    () => localStorage.getItem("asspp-default-country") || "US",
  );
  const [entity, setEntity] = useState(
    () => localStorage.getItem("asspp-default-entity") || "software",
  );
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

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
                value={i18n.language.split('-')[0]} // Normalizes en-US to en
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
          <button
            onClick={() => {
              if (
                !confirm(
                  t("settings.data.confirm"),
                )
              )
                return;
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
