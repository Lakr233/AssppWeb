import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageContainer from "../Layout/PageContainer";
import AppIcon from "../common/AppIcon";
import Alert from "../common/Alert";
import CountrySelect from "../common/CountrySelect";
import { useSearch } from "../../hooks/useSearch";
import { useAccounts } from "../../hooks/useAccounts";
import { useSettingsStore } from "../../store/settings";
import { countryCodeMap, storeIdToCountry } from "../../apple/config";
import { firstAccountCountry } from "../../utils/account";

export default function SearchPage() {
  const { t } = useTranslation();
  const { defaultCountry, defaultEntity } = useSettingsStore();
  const { accounts } = useAccounts();
  const initialCountry = firstAccountCountry(accounts) ?? defaultCountry;
  const [term, setTerm] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [entity, setEntity] = useState<string>(defaultEntity);
  const { results, loading, error, search } = useSearch();

  const availableCountryCodes = Array.from(
    new Set(
      accounts
        .map((a) => storeIdToCountry(a.store))
        .filter(Boolean) as string[],
    ),
  ).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  const allCountryCodes = Object.keys(countryCodeMap).sort((a, b) =>
    t(`countries.${a}`, a).localeCompare(t(`countries.${b}`, b)),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    search(term.trim(), country, entity);
  }

  return (
    <PageContainer title={t("search.title")}>
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !term.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t("search.searching") : t("search.button")}
          </button>
        </div>
        <div className="flex gap-3">
          <CountrySelect
            value={country}
            onChange={setCountry}
            availableCountryCodes={availableCountryCodes}
            allCountryCodes={allCountryCodes}
          />
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="iPhone">iPhone</option>
            <option value="iPad">iPad</option>
          </select>
        </div>
      </form>

      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      {results.length === 0 && !loading && !error && (
        <div className="text-center text-gray-500 py-12">
          {t("search.empty")}
        </div>
      )}

      <div className="space-y-2">
        {results.map((app) => (
          <Link
            key={app.id}
            to={`/search/${app.id}`}
            state={{ app, country }}
            className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center gap-4">
              <AppIcon url={app.artworkUrl} name={app.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{app.name}</p>
                <p className="text-sm text-gray-500 truncate">
                  {app.artistName}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{app.formattedPrice ?? t("search.free")}</span>
                  <span>{app.primaryGenreName}</span>
                  <span>
                    {app.averageUserRating.toFixed(1)} ({app.userRatingCount})
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
