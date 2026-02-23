import { useTranslation } from "react-i18next";

export default function CountrySelect({
  value,
  onChange,
  availableCountryCodes,
  allCountryCodes,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  availableCountryCodes: string[];
  allCountryCodes: string[];
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${className}`}
      disabled={disabled}
    >
      {availableCountryCodes.length > 0 && (
        <optgroup label={t("regions.available")}>
          {availableCountryCodes.map((c) => (
            <option key={`avail-${c}`} value={c}>
              {t(`countries.${c}`, c)} ({c})
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t("regions.all")}>
        {allCountryCodes.map((c) => (
          <option key={`all-${c}`} value={c}>
            {t(`countries.${c}`, c)} ({c})
          </option>
        ))}
      </optgroup>
    </select>
  );
}
