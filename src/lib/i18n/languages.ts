export const INTERFACE_LANGUAGES = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'zh-CN', flag: '🇨🇳', label: '简体中文' },
  { code: 'zh-Hant', flag: '🇨🇳', label: '繁體中文' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'th', flag: '🇹🇭', label: 'ไทย' },
  { code: 'id', flag: '🇮🇩', label: 'Bahasa Indonesia' },
] as const;

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number]['code'];
