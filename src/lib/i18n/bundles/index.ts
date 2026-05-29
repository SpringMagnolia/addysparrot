import { ar } from './ar';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { id } from './id';
import { ja } from './ja';
import { ko } from './ko';
import { pt } from './pt';
import { th } from './th';
import { zhCN } from './zhCN';
import { zhHant } from './zhHant';
import type { LocaleBundle } from '../types';

export const BUNDLES = {
  ar,
  de,
  en,
  es,
  fr,
  hi,
  id,
  ja,
  ko,
  pt,
  th,
  'zh-CN': zhCN,
  'zh-Hant': zhHant,
} satisfies Record<string, LocaleBundle>;

export type BundleLanguage = keyof typeof BUNDLES;
