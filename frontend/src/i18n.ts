import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translation JSON files directly
// To add a new language, simply create a new JSON file and import it here
import enTranslation from "./locales/en.json";
import zhTranslation from "./locales/zh.json";

// Configure translation resources
const resources = {
  en: {
    translation: enTranslation,
  },
  zh: {
    translation: zhTranslation,
  },
};

i18n
  // Detect user language automatically from the browser
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    fallbackLng: "en", // Fallback to English if the detected language is not available
    interpolation: {
      escapeValue: false, // React already protects from XSS attacks, so escaping is not needed
    },
  });

export default i18n;