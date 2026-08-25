import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import { useAppSettings } from "@/core/settings/appSettings";

const initialLanguage = useAppSettings.getState().languageCode || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

useAppSettings.subscribe((state, prevState) => {
  if (state.languageCode !== prevState.languageCode) {
    i18n.changeLanguage(state.languageCode);
  }
});

export default i18n;
