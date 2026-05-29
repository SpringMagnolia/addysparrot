import { platformBridge } from './platformBridge';
import {
  DEFAULT_DICTIONARY_TARGET_LANGUAGE,
  DICTIONARY_TARGET_LANGUAGES,
  normalizeDictionaryTargetLanguage,
  type LookupDictionaryOptions,
} from './dictionaryProviders';
import type { DictionaryEntry } from './types';

export {
  DEFAULT_DICTIONARY_TARGET_LANGUAGE,
  DICTIONARY_TARGET_LANGUAGES,
  normalizeDictionaryTargetLanguage,
};

export function normalizeLookupWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
    .trim();
}

export async function lookupWord(word: string, options?: LookupDictionaryOptions): Promise<DictionaryEntry | null> {
  const normalized = normalizeLookupWord(word);
  if (!normalized) {
    return null;
  }

  return platformBridge.dictionary.lookup(normalized, options);
}
