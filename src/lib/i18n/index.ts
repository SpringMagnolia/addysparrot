import { BUNDLES, type BundleLanguage } from './bundles';
import { INTERFACE_LANGUAGES, type InterfaceLanguage } from './languages';

export {
  INTERFACE_LANGUAGES,
  type InterfaceLanguage,
} from './languages';

export const APP_NAME = "Addy's Parrot";
export const INTERFACE_LANGUAGE_SETTING_ID = 'interfaceLanguage';
export const LANGUAGE_SETUP_COMPLETED_SETTING_ID = 'languageSetupCompleted';

export function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
  if (typeof value !== 'string') return 'en';
  return normalizeLanguageCode(value) ?? 'en';
}

export function detectSystemLanguage(): InterfaceLanguage {
  const candidates = typeof navigator === 'undefined'
    ? []
    : [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  return normalizePreferredLanguage(candidates);
}

export function normalizePreferredLanguage(candidates: string[]): InterfaceLanguage {
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) return normalized;
  }
  return 'en';
}

export function bundleLanguage(language: string): BundleLanguage {
  const normalized = normalizeInterfaceLanguage(language);
  if (normalized in BUNDLES) return normalized as BundleLanguage;
  return 'en';
}

export function createTranslator(language: string) {
  const bundle = BUNDLES[bundleLanguage(language)];
  const english = BUNDLES.en;
  return (key: string, params: Record<string, string | number> = {}) => {
    const template = bundle[key] ?? english[key] ?? key;
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}

function normalizeLanguageCode(value: string): InterfaceLanguage | null {
  const clean = value.trim();
  if (!clean) return null;
  const canonical = clean.replace('_', '-');
  if (/^zh-(tw|hk|mo|hant)$/i.test(canonical)) return 'zh-Hant';
  if (/^zh/i.test(canonical)) return 'zh-CN';
  const exact = INTERFACE_LANGUAGES.find((language) => language.code.toLowerCase() === canonical.toLowerCase());
  if (exact) return exact.code;
  const base = canonical.split('-')[0]?.toLowerCase();
  const matched = INTERFACE_LANGUAGES.find((language) => language.code.toLowerCase() === base);
  return matched ? matched.code : null;
}
