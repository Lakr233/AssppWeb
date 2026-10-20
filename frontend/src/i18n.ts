import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enUSTranslation from './locales/en-US.json';
import zhCNTranslation from './locales/zh-CN.json';
import zhTWTranslation from './locales/zh-TW.json';
import jaTranslation from './locales/ja.json';
import koTranslation from './locales/ko.json';
import ruTranslation from './locales/ru.json';

const resources = {
  'en-US': {
    translation: enUSTranslation,
  },
  'zh-CN': {
    translation: zhCNTranslation,
  },
  'zh-TW': {
    translation: zhTWTranslation,
  },
  ja: {
    translation: jaTranslation,
  },
  ko: {
    translation: koTranslation,
  },
  ru: {
    translation: ruTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
