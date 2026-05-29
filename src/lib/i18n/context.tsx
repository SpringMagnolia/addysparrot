import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  INTERFACE_LANGUAGE_SETTING_ID,
  createTranslator,
  detectSystemLanguage,
  normalizeInterfaceLanguage,
  type InterfaceLanguage,
} from '../i18n';
import { getAppSetting, saveAppSetting } from '../storage';

export type Translator = ReturnType<typeof createTranslator>;

export interface I18nContextValue {
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => Promise<void>;
  t: Translator;
}

export const defaultInterfaceLanguage = detectSystemLanguage();
export const I18nContext = createContext<I18nContextValue>({
  language: defaultInterfaceLanguage,
  setLanguage: async () => undefined,
  t: createTranslator(defaultInterfaceLanguage),
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<InterfaceLanguage>(defaultInterfaceLanguage);

  useEffect(() => {
    let cancelled = false;
    getAppSetting<string>(INTERFACE_LANGUAGE_SETTING_ID)
      .then((saved) => {
        if (!cancelled && saved) {
          setLanguageState(normalizeInterfaceLanguage(saved));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(async (nextLanguage: InterfaceLanguage) => {
    const normalized = normalizeInterfaceLanguage(nextLanguage);
    setLanguageState(normalized);
    await saveAppSetting(INTERFACE_LANGUAGE_SETTING_ID, normalized);
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, t: createTranslator(language) }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
