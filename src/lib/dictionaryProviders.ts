import type { DictionaryEntry, DictionarySection } from './types';

const DICTIONARY_CACHE_KEY = 'shadowing.dictionary.cache.v19';
const DICTIONARY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const BING_DICT_HOST = 'https://cn.bing.com';
const BING_DICT_LINK =
  'https://cn.bing.com/dict/clientsearch?mkt=zh-CN&setLang=zh&form=BDVEHC&ClientVer=BDDTV3.5.1.4320&q=';
const GOOGLE_TRANSLATE_API_BASE = 'https://translate.googleapis.com/translate_a/single';
const GOOGLE_TRANSLATE_TTS_BASE = 'https://translate.google.com/translate_tts';
const WIKT_API_BASE = 'https://api.wiktapi.dev/v1/en/word';
const FREE_DICTIONARY_API_BASE = 'https://freedictionaryapi.com/api/v1/entries/en';
const DICTIONARY_API_DEV_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

export const DEFAULT_DICTIONARY_TARGET_LANGUAGE = 'zh-CN';

export const DICTIONARY_TARGET_LANGUAGES = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'zh-CN', flag: '🇨🇳', label: '简体中文' },
  { code: 'zh-Hant', flag: '🇨🇳', label: '繁體中文' },
  { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'bn', flag: '🇧🇩', label: 'বাংলা' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'ur', flag: '🇵🇰', label: 'اردو' },
  { code: 'id', flag: '🇮🇩', label: 'Bahasa Indonesia' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'sw', flag: '🇹🇿', label: 'Kiswahili' },
  { code: 'mr', flag: '🇮🇳', label: 'मराठी' },
  { code: 'te', flag: '🇮🇳', label: 'తెలుగు' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'ta', flag: '🇮🇳', label: 'தமிழ்' },
  { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'fa', flag: '🇮🇷', label: 'فارسی' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  { code: 'th', flag: '🇹🇭', label: 'ไทย' },
  { code: 'gu', flag: '🇮🇳', label: 'ગુજરાતી' },
  { code: 'pl', flag: '🇵🇱', label: 'Polski' },
  { code: 'uk', flag: '🇺🇦', label: 'Українська' },
  { code: 'ml', flag: '🇮🇳', label: 'മലയാളം' },
  { code: 'kn', flag: '🇮🇳', label: 'ಕನ್ನಡ' },
  { code: 'or', flag: '🇮🇳', label: 'ଓଡ଼ିଆ' },
  { code: 'my', flag: '🇲🇲', label: 'မြန်မာဘာသာ' },
  { code: 'pa', flag: '🇮🇳', label: 'ਪੰਜਾਬੀ' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'ro', flag: '🇷🇴', label: 'Română' },
  { code: 'el', flag: '🇬🇷', label: 'Ελληνικά' },
  { code: 'hu', flag: '🇭🇺', label: 'Magyar' },
  { code: 'cs', flag: '🇨🇿', label: 'Čeština' },
  { code: 'sv', flag: '🇸🇪', label: 'Svenska' },
  { code: 'he', flag: '🇮🇱', label: 'עברית' },
  { code: 'fi', flag: '🇫🇮', label: 'Suomi' },
  { code: 'da', flag: '🇩🇰', label: 'Dansk' },
] as const;

export type DictionaryTargetLanguage = (typeof DICTIONARY_TARGET_LANGUAGES)[number]['code'];

interface FreeDictionaryResponse {
  word: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }>;
  }>;
}

interface WiktApiTranslationsResponse {
  word?: string;
  translations?: Array<{
    pos?: string;
    translations?: WiktApiTranslation[];
  }>;
}

interface WiktApiTranslation {
  lang?: string;
  code?: string;
  lang_code?: string;
  sense?: string;
  roman?: string;
  alt?: string;
  tags?: string[];
  word?: string;
}

interface WiktApiDefinitionsResponse {
  definitions?: Array<{
    pos?: string;
    lang_code?: string;
    senses?: Array<{
      glosses?: string[];
      examples?: Array<{
        text?: string;
        ref?: string;
      }>;
      tags?: string[];
    }>;
  }>;
}

interface WiktApiPronunciationsResponse {
  pronunciations?: Array<{
    sounds?: Array<{
      ipa?: string | null;
      audio?: string | null;
      tags?: string[];
    }>;
  }>;
}

interface FreeDictionaryApiComResponse {
  word?: string;
  entries?: Array<{
    partOfSpeech?: string;
    forms?: Array<{
      word?: string;
      tags?: string[];
    }>;
    pronunciations?: Array<{
      text?: string;
      audio?: string;
      tags?: string[];
    }>;
    senses?: Array<{
      definition?: string;
      tags?: string[];
      examples?: string[];
      quotes?: Array<{
        text?: string;
        reference?: string;
      }>;
      synonyms?: string[];
      antonyms?: string[];
      translations?: Array<{
        word?: string;
        language?: {
          code?: string;
          name?: string;
        };
      }>;
      subsenses?: Array<{
        definition?: string;
        tags?: string[];
        examples?: string[];
        synonyms?: string[];
        antonyms?: string[];
        translations?: Array<{
          word?: string;
          language?: {
            code?: string;
            name?: string;
          };
        }>;
      }>;
    }>;
    synonyms?: string[];
    antonyms?: string[];
  }>;
}

interface GoogleTranslateResponse {
  sentences?: Array<{
    trans?: string;
    orig?: string;
    src_translit?: string;
  }>;
  dict?: GoogleTranslateDictionaryGroup[];
  definitions?: GoogleTranslateDefinitionGroup[];
  examples?: {
    example?: GoogleTranslateExample[];
  };
  synsets?: GoogleTranslateSynsetGroup[];
  src?: string;
}

interface GoogleTranslateDictionaryGroup {
  pos?: string;
  terms?: string[];
  entry?: Array<{
    word?: string;
    reverse_translation?: string[];
    score?: number;
    previous_word?: string;
  }>;
  base_form?: string;
  pos_enum?: number;
}

interface GoogleTranslateDefinitionGroup {
  pos?: string;
  entry?: Array<{
    gloss?: string;
    definition_id?: string;
    example?: string;
  }>;
}

interface GoogleTranslateExample {
  text?: string;
  definition_id?: string;
}

interface GoogleTranslateSynsetGroup {
  pos?: string;
  entry?: Array<{
    synonym?: string[];
    definition_id?: string;
    label_info?: {
      register?: string[];
    };
  }>;
}

type FreeDictionaryApiComEntry = NonNullable<FreeDictionaryApiComResponse['entries']>[number];
type FreeDictionaryApiComSense = NonNullable<FreeDictionaryApiComEntry['senses']>[number];

interface TargetTranslationDetail {
  partOfSpeech: string;
  word: string;
  roman?: string;
  alt?: string;
  sense?: string;
  definition?: string;
  tags?: string[];
  examples?: string[];
}

interface EnglishSenseDetail {
  partOfSpeech: string;
  definition: string;
  tags?: string[];
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
}

interface CachedDictionaryEntry {
  entry: DictionaryEntry;
  cachedAt: number;
}

type DictionaryCache = Record<string, CachedDictionaryEntry>;
type FetchBingHtml = (normalizedWord: string) => Promise<string | null>;
type DictionaryLookupLog = (event: string, details: Record<string, unknown>) => void | Promise<void>;

export interface LookupDictionaryOptions {
  forceRefresh?: boolean;
  bingOnly?: boolean;
  targetLanguage?: string;
  logEvent?: DictionaryLookupLog;
}

export async function lookupDictionaryEntry(
  normalizedWord: string,
  fetchBingHtml: FetchBingHtml,
  options: LookupDictionaryOptions = {},
): Promise<DictionaryEntry | null> {
  const targetLanguage = normalizeDictionaryTargetLanguage(options.targetLanguage);
  const logEvent = options.logEvent;
  const cachedEntry = options.forceRefresh ? null : readCachedDictionaryEntry(normalizedWord, targetLanguage);
  if (cachedEntry && !options.bingOnly) {
    emitDictionaryLookupLog(logEvent, 'dictionary-cache-hit', {
      word: normalizedWord,
      targetLanguage,
      result: summarizeDictionaryEntry(cachedEntry),
    });
    return cachedEntry;
  }

  const primaryEntry = await lookupPrimaryDictionaryEntry(normalizedWord, targetLanguage, fetchBingHtml, logEvent);

  if (primaryEntry) {
    const entryWithPronunciation = primaryEntry.audio?.remoteUrl && primaryEntry.phonetic
      ? primaryEntry
      : mergeDictionaryPronunciation(
          mergeDictionaryPronunciation(primaryEntry, await lookupDictionaryApiDev(normalizedWord)),
          await lookupGoogleTranslatePronunciation(normalizedWord),
        );
    writeCachedDictionaryEntry(normalizedWord, targetLanguage, entryWithPronunciation);
    const normalizedEntryWord = normalizeDictionaryWord(entryWithPronunciation.word);
    if (normalizedEntryWord && normalizedEntryWord !== normalizedWord) {
      writeCachedDictionaryEntry(normalizedEntryWord, targetLanguage, entryWithPronunciation);
    }
    return entryWithPronunciation;
  }

  if (options.bingOnly) {
    return null;
  }

  const freeDictionaryEntry = targetLanguage === 'en'
    ? await lookupFreeDictionaryApiComEnglish(normalizedWord)
    : await lookupFreeDictionaryApiCom(normalizedWord, targetLanguage);
  if (freeDictionaryEntry) {
    const entryWithPronunciation = mergeDictionaryPronunciation(freeDictionaryEntry, await lookupDictionaryApiDev(normalizedWord));
    writeCachedDictionaryEntry(normalizedWord, targetLanguage, entryWithPronunciation);
    return entryWithPronunciation;
  }

  const fallbackEntry = await lookupDictionaryApiDev(normalizedWord);
  if (fallbackEntry) {
    writeCachedDictionaryEntry(normalizedWord, targetLanguage, fallbackEntry);
  }
  return fallbackEntry;
}

export async function fetchBingDictionaryHtmlInBrowser(normalizedWord: string): Promise<string | null> {
  const response = await fetch(BING_DICT_LINK + encodeURIComponent(normalizedWord), {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  return response.text().catch(() => null);
}

async function lookupPrimaryDictionaryEntry(
  normalizedWord: string,
  targetLanguage: DictionaryTargetLanguage,
  fetchBingHtml: FetchBingHtml,
  logEvent?: DictionaryLookupLog,
): Promise<DictionaryEntry | null> {
  if (targetLanguage === 'zh-CN') {
    emitDictionaryLookupLog(logEvent, 'dictionary-provider-selected', {
      word: normalizedWord,
      targetLanguage,
      provider: 'bing',
      reason: 'zh-CN-primary',
    });
    return lookupBingDictionary(normalizedWord, fetchBingHtml);
  }

  if (targetLanguage === 'en') {
    emitDictionaryLookupLog(logEvent, 'dictionary-provider-selected', {
      word: normalizedWord,
      targetLanguage,
      provider: 'wiktApi',
      reason: 'english-target',
    });
    return lookupWiktApiEnglishDictionary(normalizedWord);
  }

  if (isChineseDictionaryTargetLanguage(targetLanguage)) {
    emitDictionaryLookupLog(logEvent, 'dictionary-provider-selected', {
      word: normalizedWord,
      targetLanguage,
      provider: 'wiktApi',
      reason: 'chinese-variant-target',
    });
    return lookupWiktApiDictionary(normalizedWord, targetLanguage);
  }

  const googleEntry = await lookupGoogleTranslateDictionary(normalizedWord, targetLanguage, logEvent);
  if (googleEntry) {
    emitDictionaryLookupLog(logEvent, 'dictionary-provider-selected', {
      word: normalizedWord,
      targetLanguage,
      provider: 'googleTranslate',
      reason: 'non-chinese-target-primary',
      result: summarizeDictionaryEntry(googleEntry),
    });
    return googleEntry;
  }

  emitDictionaryLookupLog(logEvent, 'dictionary-provider-fallback', {
    word: normalizedWord,
    targetLanguage,
    fromProvider: 'googleTranslate',
    toProvider: 'wiktApi',
  });
  return lookupWiktApiDictionary(normalizedWord, targetLanguage);
}

async function lookupGoogleTranslateDictionary(
  normalizedWord: string,
  targetLanguage: DictionaryTargetLanguage,
  logEvent?: DictionaryLookupLog,
): Promise<DictionaryEntry | null> {
  const googleTargetLanguage = toGoogleTranslateLanguageCode(targetLanguage);
  emitDictionaryLookupLog(logEvent, 'dictionary-google-translate-request', {
    word: normalizedWord,
    targetLanguage,
    googleTargetLanguage,
  });
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: googleTargetLanguage,
    hl: googleTargetLanguage,
    dj: '1',
    ie: 'UTF-8',
    oe: 'UTF-8',
    otf: '1',
    ssel: '0',
    tsel: '0',
    q: normalizedWord,
  });
  for (const dataType of ['t', 'bd', 'at', 'md', 'ss', 'ex', 'rm']) {
    params.append('dt', dataType);
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_API_BASE}?${params.toString()}`).catch(() => null);
  if (!response?.ok) {
    emitDictionaryLookupLog(logEvent, 'dictionary-google-translate-failed', {
      word: normalizedWord,
      targetLanguage,
      googleTargetLanguage,
      status: response?.status ?? 'network-error',
    });
    return null;
  }

  const data = (await response.json().catch(() => null)) as GoogleTranslateResponse | null;
  const translationDetails = createTranslationDetailsFromGoogleTranslate(data, targetLanguage);
  const meanings = createMeaningsFromTranslationDetails(translationDetails);
  if (meanings.length === 0) {
    emitDictionaryLookupLog(logEvent, 'dictionary-google-translate-no-result', {
      word: normalizedWord,
      targetLanguage,
      googleTargetLanguage,
      detectedSource: data?.src,
      dictGroupCount: data?.dict?.length ?? 0,
      sentenceTranslation: getGoogleTranslateSentenceTranslation(data),
    });
    return null;
  }

  const englishSenses = createEnglishSensesFromGoogleTranslate(data);
  const examples = createExamplesFromGoogleTranslate(data);
  const entryWord = getGoogleTranslateBaseWord(data) || normalizedWord;

  const entry: DictionaryEntry = {
    word: entryWord,
    source: 'googleTranslate',
    phonetic: getGoogleTranslateSourceTranslit(data),
    audio: {
      remoteUrl: createGoogleTranslateTtsAudioUrl(entryWord),
      status: 'available',
    },
    ...(examples.length > 0 ? { examples: examples.map((example) => ({ en: example })) } : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails,
      englishSenses,
      extraExamples: examples,
      showEnglishDefinitions: englishSenses.length > 0,
    }),
  };

  emitDictionaryLookupLog(logEvent, 'dictionary-google-translate-success', {
    word: normalizedWord,
    targetLanguage,
    googleTargetLanguage,
    detectedSource: data?.src,
    sentenceTranslation: getGoogleTranslateSentenceTranslation(data),
    sourceTranslit: getGoogleTranslateSourceTranslit(data),
    rawCounts: getGoogleTranslateRawCounts(data),
    result: summarizeDictionaryEntry(entry),
  });

  return entry;
}

async function lookupGoogleTranslatePronunciation(normalizedWord: string): Promise<DictionaryEntry | null> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'en',
    hl: 'en',
    dj: '1',
    ie: 'UTF-8',
    oe: 'UTF-8',
    q: normalizedWord,
  });
  for (const dataType of ['t', 'rm']) {
    params.append('dt', dataType);
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_API_BASE}?${params.toString()}`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as GoogleTranslateResponse | null;
  const phonetic = getGoogleTranslateSourceTranslit(data);
  const audioUrl = createGoogleTranslateTtsAudioUrl(normalizedWord);
  if (!phonetic && !audioUrl) {
    return null;
  }

  return {
    word: normalizedWord,
    source: 'googleTranslatePronunciation',
    phonetic,
    audio: {
      remoteUrl: audioUrl,
      status: 'available',
    },
    meanings: [],
  };
}

async function lookupBingDictionary(normalizedWord: string, fetchBingHtml: FetchBingHtml): Promise<DictionaryEntry | null> {
  const html = await fetchBingHtml(normalizedWord);
  if (!html) {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = cleanText(doc.querySelector('.client_def_hd_hd')?.textContent);
  const definitionSection = parseBingDefinitionSection(doc);
  const relatedSection = parseBingRelatedSection(doc);
  const examples = parseBingExamples(doc);
  const exampleSection = examples.length > 0
    ? {
        title: 'Examples',
        titleKey: 'dictionarySectionExamples',
        groups: examples.map((example) => ({
          lines: [example.en, ...(example.zh ? [example.zh] : [])],
        })),
      }
    : null;
  const meanings = parseBingMeanings(doc);
  const sections = [definitionSection, relatedSection, exampleSection].filter(
    (section): section is DictionarySection => Boolean(section && section.groups.length > 0),
  );

  if (!title || meanings.length === 0) {
    return null;
  }

  const usPronunciation = getBingUsPronunciation(doc);
  const inflections = parseBingInflections(doc);

  return {
    word: title,
    source: 'bing',
    phonetic: usPronunciation?.phonetic,
    ...(usPronunciation?.remoteUrl
      ? { audio: { remoteUrl: usPronunciation.remoteUrl, status: 'available' as const } }
      : {}),
    ...(inflections.length > 0 ? { inflections } : {}),
    ...(examples.length > 0 ? { examples } : {}),
    ...(sections.length > 0 ? { sections } : {}),
    meanings,
  };
}

function parseBingDefinitionSection(doc: Document): DictionarySection | null {
  const container = doc.querySelector('#client_def_container');
  if (!container) {
    return null;
  }

  const groups: DictionarySection['groups'] = [];
  for (const child of Array.from(container.children)) {
    if (child.classList.contains('client_def_bar')) {
      const label = cleanText(child.querySelector('.client_def_title_bar')?.textContent);
      const lines = getDefinitionLines(child);
      if (lines.length > 0) {
        groups.push({
          label: label || undefined,
          lines,
        });
      }
    }

    if (child.classList.contains('client_word_change_bar')) {
      const lines = Array.from(child.querySelectorAll('.client_word_change_word'))
        .map((item) => {
          const label = cleanText(item.getAttribute('title'));
          const word = cleanText(item.textContent);
          return label && word ? `${label}: ${word}` : word;
        })
        .filter(Boolean);
      if (lines.length > 0) {
        groups.push({ label: 'Forms', labelKey: 'dictionarySectionForms', lines: [lines.join('; ')] });
      }
    }
  }

  return groups.length > 0 ? { title: '', groups } : null;
}

function parseBingRelatedSection(doc: Document): DictionarySection | null {
  const container = doc.querySelector('.client_search_rightside_content');
  if (!container) {
    return null;
  }

  const groups: DictionarySection['groups'] = [];
  container.querySelectorAll('.client_side_bar').forEach((sideBar) => {
    const title = cleanText(sideBar.querySelector('.client_side_title')?.textContent);
    sideBar.querySelectorAll('.client_siderbar_content').forEach((content) => {
      const label = [title, cleanText(content.querySelector('.client_siderbar_list_title')?.textContent)].filter(Boolean).join(' ');
      const lines = Array.from(content.querySelectorAll('.client_siderbar_list_word'))
        .map((item) => cleanText(item.textContent))
        .filter(Boolean);
      if (lines.length > 0) {
        groups.push({ label: label || title || undefined, lines: [lines.join('; ')] });
      }
    });
  });

  return groups.length > 0 ? { title: 'Related', titleKey: 'dictionarySectionRelated', groups } : null;
}

function parseBingExamples(doc: Document): NonNullable<DictionaryEntry['examples']> {
  return Array.from(doc.querySelectorAll('.client_sentence_list'))
    .slice(0, 3)
    .map((item) => ({
      en: cleanSentenceText(item.querySelector('.client_sen_en')?.textContent),
      zh: cleanText(item.querySelector('.client_sen_cn')?.textContent) || undefined,
    }))
    .filter((example) => example.en);
}

function parseBingMeanings(doc: Document): DictionaryEntry['meanings'] {
  const container = doc.querySelector('#client_def_container');
  if (!container) {
    return [];
  }

  return Array.from(container.children)
    .filter((child) => child.classList.contains('client_def_bar'))
    .map((definition) => ({
      partOfSpeech: cleanText(definition.querySelector('.client_def_title_bar')?.textContent) || 'meaning',
      definitions: getDefinitionLines(definition),
    }))
    .filter((meaning) => meaning.definitions.length > 0);
}

function parseBingInflections(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('#client_word_change_def .client_word_change_word'))
    .map((item) => {
      const label = cleanText(item.getAttribute('title'));
      const word = cleanText(item.textContent);
      return label && word ? `${label}: ${word}` : word;
    })
    .filter(Boolean);
}

function getDefinitionLines(parent: Element): string[] {
  const items = Array.from(parent.querySelectorAll('.client_def_list_item'));
  const lines = (items.length > 0 ? items : [])
    .map((item) => cleanText(item.querySelector('.client_def_list_word_content')?.textContent))
    .filter((line) => line && !isScriptJunkText(line))
    .filter(Boolean);

  return Array.from(new Set(lines));
}

function getBingUsPronunciation(doc: Document): { phonetic?: string; remoteUrl?: string } | null {
  const pronunciationItems = Array.from(doc.querySelectorAll('.client_def_hd_pn_list'))
    .filter((item) => item.querySelector('.client_def_hd_pn'));
  const usItem =
    pronunciationItems.find((item) => cleanText(item.textContent).includes('美')) ??
    pronunciationItems.find((item) => /(^|\s)(us|american|ame)(\s|$|[:：[])/i.test(cleanText(item.textContent)));

  if (!usItem) {
    return null;
  }

  return {
    phonetic: cleanPhonetic(usItem.querySelector('.client_def_hd_pn')?.textContent),
    remoteUrl: getBingAudioUrl(usItem),
  };
}

function getBingAudioUrl(parent: Element): string | undefined {
  const candidates = [
    parent,
    ...Array.from(parent.querySelectorAll('[data-pronunciation], [data-mp3link], [audiomd5], [onclick]')),
  ];

  for (const item of candidates) {
    for (const attr of ['data-pronunciation', 'data-mp3link', 'audiomd5']) {
      const value = item.getAttribute(attr);
      if (value) {
        return createAbsoluteBingUrl(value);
      }
    }

    const onclick = item.getAttribute('onclick') ?? '';
    const match = onclick.match(/((?:https?:)?\/\/[^'")\s]+\.mp3(?:\?[^'")\s]*)?|\/[^'")\s]+\.mp3(?:\?[^'")\s]*)?)/);
    if (match?.[1]) {
      return createAbsoluteBingUrl(match[1]);
    }
  }

  return undefined;
}

function createAbsoluteBingUrl(value: string): string {
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  return new URL(value, BING_DICT_HOST).href;
}

async function lookupWiktApiDictionary(normalizedWord: string, targetLanguage: DictionaryTargetLanguage): Promise<DictionaryEntry | null> {
  const response = await fetch(`${WIKT_API_BASE}/${encodeURIComponent(normalizedWord)}/translations`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const [data, pronunciation] = await Promise.all([
    response.json().catch(() => null) as Promise<WiktApiTranslationsResponse | null>,
    lookupWiktApiPronunciation(normalizedWord),
  ]);
  const rows = data?.translations?.flatMap((group) =>
    (group.translations ?? []).map((translation) => ({
      partOfSpeech: group.pos ?? 'meaning',
      translation,
    })),
  ) ?? [];
  const translationDetails = createTranslationDetailsFromWiktApi(rows, targetLanguage);
  const meanings = createMeaningsFromTranslationDetails(translationDetails);
  if (meanings.length === 0) {
    return null;
  }

  return {
    word: data?.word || normalizedWord,
    source: 'wiktApi',
    phonetic: pronunciation?.phonetic,
    ...(pronunciation?.remoteUrl
      ? { audio: { remoteUrl: pronunciation.remoteUrl, status: 'available' as const } }
      : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails,
    }),
  };
}

async function lookupWiktApiEnglishDictionary(normalizedWord: string): Promise<DictionaryEntry | null> {
  const [definitionsData, pronunciation] = await Promise.all([
    lookupWiktApiDefinitions(normalizedWord),
    lookupWiktApiPronunciation(normalizedWord),
  ]);
  const englishSenses = createEnglishSensesFromWiktApiDefinitions(definitionsData);
  if (englishSenses.length === 0) {
    return null;
  }
  const meanings = Array.from(groupByPartOfSpeech(englishSenses), ([partOfSpeech, senses]) => ({
    partOfSpeech,
    definitions: [senses.map(formatEnglishSense).join('; ')],
  }));
  const examples = collectExamplesFromEnglishSenses(englishSenses);

  return {
    word: normalizedWord,
    source: 'wiktApi',
    phonetic: pronunciation?.phonetic,
    ...(pronunciation?.remoteUrl
      ? { audio: { remoteUrl: pronunciation.remoteUrl, status: 'available' as const } }
      : {}),
    ...(examples.length > 0 ? { examples: examples.map((example) => ({ en: example })) } : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails: [],
      englishSenses,
      showEnglishDefinitions: true,
    }),
  };
}

async function lookupWiktApiDefinitions(normalizedWord: string): Promise<WiktApiDefinitionsResponse | null> {
  const response = await fetch(`${WIKT_API_BASE}/${encodeURIComponent(normalizedWord)}/definitions`).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  return response.json().catch(() => null) as Promise<WiktApiDefinitionsResponse | null>;
}

async function lookupWiktApiPronunciation(normalizedWord: string): Promise<{ phonetic?: string; remoteUrl?: string } | null> {
  const response = await fetch(`${WIKT_API_BASE}/${encodeURIComponent(normalizedWord)}/pronunciations`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as WiktApiPronunciationsResponse | null;
  const sounds = data?.pronunciations?.flatMap((pronunciation) => pronunciation.sounds ?? []) ?? [];
  const usSound = sounds.find((sound) => sound.tags?.some((tag) => /general-american|us|american/i.test(tag)));
  const phonetic = cleanPhonetic((usSound ?? sounds.find((sound) => sound.ipa))?.ipa);
  const audio = sounds.find((sound) => sound.audio)?.audio ?? undefined;
  const remoteUrl = audio ? createWikimediaAudioUrl(audio) : undefined;

  return phonetic || remoteUrl ? { phonetic, remoteUrl } : null;
}

async function lookupFreeDictionaryApiCom(normalizedWord: string, targetLanguage: DictionaryTargetLanguage): Promise<DictionaryEntry | null> {
  const response = await fetch(`${FREE_DICTIONARY_API_BASE}/${encodeURIComponent(normalizedWord)}?translations=true`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as FreeDictionaryApiComResponse | null;
  const translationDetails = createTranslationDetailsFromFreeDictionaryApiCom(data, targetLanguage);
  const meanings = createMeaningsFromTranslationDetails(translationDetails);
  if (meanings.length === 0) {
    return null;
  }

  const pronunciation = getFreeDictionaryApiComPronunciation(data);

  return {
    word: data?.word || normalizedWord,
    source: 'freeDictionaryApi',
    phonetic: pronunciation?.phonetic,
    ...(pronunciation?.remoteUrl
      ? { audio: { remoteUrl: pronunciation.remoteUrl, status: 'available' as const } }
      : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails,
    }),
  };
}

async function lookupFreeDictionaryApiComEnglish(normalizedWord: string): Promise<DictionaryEntry | null> {
  const response = await fetch(`${FREE_DICTIONARY_API_BASE}/${encodeURIComponent(normalizedWord)}?translations=true`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as FreeDictionaryApiComResponse | null;
  const englishSenses = createEnglishSensesFromFreeDictionaryApiCom(data);
  if (englishSenses.length === 0) {
    return null;
  }
  const pronunciation = getFreeDictionaryApiComPronunciation(data);
  const forms = createFormsFromFreeDictionaryApiCom(data);
  const related = createRelatedLinesFromEnglishSenses(englishSenses);
  const examples = collectExamplesFromEnglishSenses(englishSenses);
  const meanings = Array.from(groupByPartOfSpeech(englishSenses), ([partOfSpeech, senses]) => ({
    partOfSpeech,
    definitions: [senses.map(formatEnglishSense).join('; ')],
  }));

  return {
    word: data?.word || normalizedWord,
    source: 'freeDictionaryApi',
    phonetic: pronunciation?.phonetic,
    ...(pronunciation?.remoteUrl
      ? { audio: { remoteUrl: pronunciation.remoteUrl, status: 'available' as const } }
      : {}),
    ...(forms.length > 0 ? { inflections: forms } : {}),
    ...(examples.length > 0 ? { examples: examples.map((example) => ({ en: example })) } : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails: [],
      englishSenses,
      forms,
      related,
      showEnglishDefinitions: true,
    }),
  };
}

async function lookupDictionaryApiDev(normalizedWord: string): Promise<DictionaryEntry | null> {
  const response = await fetch(`${DICTIONARY_API_DEV_BASE}/${encodeURIComponent(normalizedWord)}`).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as FreeDictionaryResponse[] | null;
  const first = data?.[0];
  if (!first) {
    return null;
  }

  const remoteUrl = normalizeAudioUrl(first.phonetics?.find((item) => item.audio)?.audio);
  const phonetic = cleanPhonetic(first.phonetic) || cleanPhonetic(first.phonetics?.find((item) => cleanPhonetic(item.text))?.text);
  const englishSenses =
    first.meanings?.flatMap((meaning) =>
      (meaning.definitions ?? []).map((definition) => ({
        partOfSpeech: meaning.partOfSpeech ?? 'meaning',
        definition: cleanText(definition.definition),
        examples: definition.example ? [cleanSentenceText(definition.example)] : [],
        synonyms: definition.synonyms?.map(cleanText).filter(Boolean),
        antonyms: definition.antonyms?.map(cleanText).filter(Boolean),
      })),
    ).filter((sense) => sense.definition) ?? [];
  const meanings = Array.from(groupByPartOfSpeech(englishSenses), ([partOfSpeech, senses]) => ({
    partOfSpeech,
    definitions: [senses.map((sense) => sense.definition).join('; ')],
  }));
  const related = createRelatedLinesFromEnglishSenses(englishSenses);
  const examples = collectExamplesFromEnglishSenses(englishSenses);

  return {
    word: first.word,
    source: 'dictionaryApiDev',
    phonetic,
    ...(remoteUrl ? { audio: { remoteUrl, status: 'available' as const } } : {}),
    ...(examples.length > 0 ? { examples: examples.map((example) => ({ en: example })) } : {}),
    meanings,
    sections: createUnifiedDictionarySections({
      translationDetails: [],
      englishSenses,
      related,
      showEnglishDefinitions: true,
    }),
  };
}

function createTranslationDetailsFromWiktApi(
  rows: Array<{ partOfSpeech: string; translation: WiktApiTranslation }>,
  targetLanguage: DictionaryTargetLanguage,
): TargetTranslationDetail[] {
  const targetCodes = getWiktApiTargetCodes(targetLanguage);
  const details: TargetTranslationDetail[] = [];

  for (const row of rows) {
    if (!isTargetTranslation(row.translation, targetCodes, targetLanguage)) {
      continue;
    }
    const word = normalizeTranslatedWord(row.translation.word, targetLanguage);
    if (!word) {
      continue;
    }
    details.push({
      partOfSpeech: row.partOfSpeech || 'meaning',
      word,
      roman: cleanText(row.translation.roman),
      alt: cleanText(row.translation.alt),
      sense: cleanText(row.translation.sense),
      tags: row.translation.tags?.map(cleanText).filter(Boolean),
    });
  }

  return dedupeTranslationDetails(details);
}

function createTranslationDetailsFromFreeDictionaryApiCom(
  data: FreeDictionaryApiComResponse | null,
  targetLanguage: DictionaryTargetLanguage,
): TargetTranslationDetail[] {
  const targetCodes = getWiktApiTargetCodes(targetLanguage);
  const details: TargetTranslationDetail[] = [];

  for (const entry of data?.entries ?? []) {
    const partOfSpeech = entry.partOfSpeech || 'meaning';
    const senses = flattenFreeDictionaryApiComSenses(entry.senses ?? []);
    for (const sense of senses) {
      for (const translation of sense.translations ?? []) {
        const code = translation.language?.code;
        const name = translation.language?.name;
        if (!code || !targetCodes.includes(code) || !isLikelyTargetText(translation.word, targetLanguage, name)) {
          continue;
        }
        const word = normalizeTranslatedWord(translation.word, targetLanguage);
        if (word) {
          details.push({
            partOfSpeech,
            word,
            definition: cleanText(sense.definition),
            tags: sense.tags?.map(cleanText).filter(Boolean),
            examples: sense.examples?.map(cleanSentenceText).filter(Boolean),
          });
        }
      }
    }
  }

  return dedupeTranslationDetails(details);
}

function createTranslationDetailsFromGoogleTranslate(
  data: GoogleTranslateResponse | null,
  targetLanguage: DictionaryTargetLanguage,
): TargetTranslationDetail[] {
  const details: TargetTranslationDetail[] = (data?.dict ?? []).flatMap((group) => {
    const partOfSpeech = cleanText(group.pos) || 'meaning';
    return (group.entry ?? [])
      .map((entry): TargetTranslationDetail | null => {
        const word = normalizeTranslatedWord(formatGoogleTranslateEntryWord(entry), targetLanguage);
        if (!word || !isLikelyTargetText(word, targetLanguage)) {
          return null;
        }
        const reverseTranslations = entry.reverse_translation?.map(cleanText).filter(Boolean) ?? [];
        return {
          partOfSpeech,
          word,
          sense: reverseTranslations.slice(0, 5).join(', '),
        };
      })
      .filter((detail): detail is TargetTranslationDetail => Boolean(detail));
  });

  return dedupeTranslationDetails(details);
}

function createEnglishSensesFromGoogleTranslate(data: GoogleTranslateResponse | null): EnglishSenseDetail[] {
  return (data?.definitions ?? []).flatMap((group) => {
    const partOfSpeech = cleanText(group.pos) || 'meaning';
    return (group.entry ?? [])
      .map((entry) => ({
        partOfSpeech,
        definition: cleanText(entry.gloss),
        examples: entry.example ? [cleanSentenceText(entry.example)] : [],
      }))
      .filter((sense) => sense.definition);
  });
}

function createExamplesFromGoogleTranslate(data: GoogleTranslateResponse | null): string[] {
  return Array.from(new Set(
    (data?.examples?.example ?? [])
      .map((example) => cleanHtmlText(example.text))
      .filter(Boolean),
  ));
}

function formatGoogleTranslateEntryWord(entry: NonNullable<GoogleTranslateDictionaryGroup['entry']>[number]): string {
  const word = cleanText(entry.word);
  if (!word) {
    return '';
  }

  const previousWord = cleanText(entry.previous_word);
  if (!previousWord || word.toLowerCase().startsWith(`${previousWord.toLowerCase()} `)) {
    return word;
  }
  return `${previousWord} ${word}`;
}

function getGoogleTranslateBaseWord(data: GoogleTranslateResponse | null): string {
  const baseForm = data?.dict?.map((group) => cleanText(group.base_form)).find(Boolean);
  const original = data?.sentences?.map((sentence) => cleanText(sentence.orig)).find(Boolean);
  return baseForm || original || '';
}

function getGoogleTranslateSentenceTranslation(data: GoogleTranslateResponse | null): string {
  return cleanText(data?.sentences?.map((sentence) => sentence.trans).filter(Boolean).join(' '));
}

function getGoogleTranslateSourceTranslit(data: GoogleTranslateResponse | null): string {
  const sourceTranslit = data?.sentences?.map((sentence) => cleanText(sentence.src_translit)).find(Boolean);
  return cleanGoogleTranslatePhonetic(sourceTranslit);
}

function cleanGoogleTranslatePhonetic(value: string | undefined): string {
  const phonetic = cleanText(value);
  if (!phonetic || phonetic.length > 80 || isScriptJunkText(phonetic)) {
    return '';
  }
  return phonetic;
}

function createGoogleTranslateTtsAudioUrl(word: string): string {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    client: 'tw-ob',
    tl: 'en',
    q: word,
  });
  return `${GOOGLE_TRANSLATE_TTS_BASE}?${params.toString()}`;
}

function getGoogleTranslateRawCounts(data: GoogleTranslateResponse | null): Record<string, number> {
  return {
    dictGroupCount: data?.dict?.length ?? 0,
    dictionaryEntryCount: data?.dict?.reduce((count, group) => count + (group.entry?.length ?? 0), 0) ?? 0,
    definitionCount: data?.definitions?.reduce((count, group) => count + (group.entry?.length ?? 0), 0) ?? 0,
    synsetCount: data?.synsets?.reduce((count, group) => count + (group.entry?.length ?? 0), 0) ?? 0,
    exampleCount: data?.examples?.example?.length ?? 0,
  };
}

function createMeaningsFromTranslationDetails(details: TargetTranslationDetail[]): DictionaryEntry['meanings'] {
  return Array.from(groupByPartOfSpeech(details), ([partOfSpeech, items]) => ({
    partOfSpeech,
    definitions: [items.map(formatTranslationDetail).join('; ')],
  })).filter((meaning) => meaning.definitions.length > 0);
}

function createUnifiedDictionarySections(options: {
  translationDetails: TargetTranslationDetail[];
  englishSenses?: EnglishSenseDetail[];
  forms?: string[];
  related?: DictionarySection['groups'];
  extraExamples?: string[];
  showEnglishDefinitions?: boolean;
}): DictionarySection[] {
  const sections: Array<DictionarySection | null> = [
    createTargetTranslationSection(options.translationDetails),
    options.showEnglishDefinitions ? createEnglishDefinitionSection(options.englishSenses ?? []) : null,
    options.showEnglishDefinitions ? createFormsSection(options.forms ?? []) : null,
    options.showEnglishDefinitions && !hasInlineRelatedHints(options.translationDetails)
      ? createRelatedSection(options.related ?? [])
      : null,
    options.showEnglishDefinitions ? createExampleSection(options.englishSenses ?? [], options.extraExamples ?? []) : null,
  ];

  return sections.filter((section): section is DictionarySection => Boolean(section && section.groups.length > 0));
}

function createTargetTranslationSection(details: TargetTranslationDetail[]): DictionarySection | null {
  const groups = Array.from(groupByPartOfSpeech(details), ([partOfSpeech, items]) => ({
    label: partOfSpeech,
    lines: items.map(formatTranslationDetail).filter(Boolean),
  })).filter((group) => group.lines.length > 0);

  return groups.length > 0 ? { title: '', groups } : null;
}

function hasInlineRelatedHints(details: TargetTranslationDetail[]): boolean {
  return details.some((detail) => {
    const sense = cleanText(detail.sense);
    return /[A-Za-z]/.test(sense) && /[,;]/.test(sense);
  });
}

function createEnglishDefinitionSection(senses: EnglishSenseDetail[]): DictionarySection | null {
  const groups = Array.from(groupByPartOfSpeech(senses), ([partOfSpeech, items]) => ({
    label: partOfSpeech,
    lines: items.map(formatEnglishSense).filter(Boolean),
  })).filter((group) => group.lines.length > 0);

  return groups.length > 0
    ? { title: 'English definitions', titleKey: 'dictionarySectionEnglishDefinitions', groups }
    : null;
}

function createExampleSection(senses: EnglishSenseDetail[], extraExamples: string[] = []): DictionarySection | null {
  const examples = Array.from(new Set([
    ...collectExamplesFromEnglishSenses(senses),
    ...extraExamples.map(cleanSentenceText).filter(Boolean),
  ]));
  const groups = examples.slice(0, 3).map((example) => ({ lines: [example] }));
  return groups.length > 0
    ? { title: 'Examples', titleKey: 'dictionarySectionExamples', groups }
    : null;
}

function createFormsSection(forms: string[]): DictionarySection | null {
  const lines = Array.from(new Set(forms.map(cleanText).filter(Boolean)));
  return lines.length > 0
    ? { title: 'Forms', titleKey: 'dictionarySectionForms', groups: [{ lines: [lines.join('; ')] }] }
    : null;
}

function createRelatedSection(groups: DictionarySection['groups']): DictionarySection | null {
  const cleanGroups = groups
    .map((group) => ({
      label: cleanText(group.label),
      lines: Array.from(new Set(group.lines.map(cleanText).filter(Boolean))),
    }))
    .filter((group) => group.lines.length > 0);

  return cleanGroups.length > 0
    ? { title: 'Related', titleKey: 'dictionarySectionRelated', groups: cleanGroups }
    : null;
}

function createEnglishSensesFromWiktApiDefinitions(data: WiktApiDefinitionsResponse | null): EnglishSenseDetail[] {
  return (data?.definitions ?? [])
    .filter((entry) => entry.lang_code === 'en')
    .flatMap((entry) =>
      (entry.senses ?? []).map((sense) => ({
        partOfSpeech: entry.pos || 'meaning',
        definition: cleanText(sense.glosses?.join(' ')),
        tags: sense.tags?.map(cleanText).filter(Boolean),
        examples: sense.examples?.map((example) => cleanSentenceText(example.text)).filter(Boolean),
      })),
    )
    .filter((sense) => sense.definition);
}

function createEnglishSensesFromFreeDictionaryApiCom(data: FreeDictionaryApiComResponse | null): EnglishSenseDetail[] {
  return (data?.entries ?? []).flatMap((entry) => {
    const partOfSpeech = entry.partOfSpeech || 'meaning';
    return flattenFreeDictionaryApiComSenses(entry.senses ?? [])
      .map((sense) => ({
        partOfSpeech,
        definition: cleanText(sense.definition),
        tags: sense.tags?.map(cleanText).filter(Boolean),
        examples: [
          ...(sense.examples?.map(cleanSentenceText).filter(Boolean) ?? []),
          ...(sense.quotes?.map((quote) => cleanSentenceText(quote.text)).filter(Boolean) ?? []),
        ],
        synonyms: sense.synonyms?.map(cleanText).filter(Boolean),
        antonyms: sense.antonyms?.map(cleanText).filter(Boolean),
      }))
      .filter((sense) => sense.definition);
  });
}

function flattenFreeDictionaryApiComSenses(senses: FreeDictionaryApiComSense[]): FreeDictionaryApiComSense[] {
  return senses.flatMap((sense) => [sense, ...flattenFreeDictionaryApiComSenses((sense.subsenses ?? []) as FreeDictionaryApiComSense[])]);
}

function createFormsFromFreeDictionaryApiCom(data: FreeDictionaryApiComResponse | null): string[] {
  return (data?.entries ?? [])
    .flatMap((entry) => entry.forms ?? [])
    .map((form) => {
      const tags = form.tags?.map(cleanText).filter(Boolean).join(', ');
      const word = cleanText(form.word);
      return word && tags ? `${tags}: ${word}` : word;
    })
    .filter(Boolean);
}

function createRelatedLinesFromEnglishSenses(senses: EnglishSenseDetail[]): DictionarySection['groups'] {
  const synonyms = Array.from(new Set(senses.flatMap((sense) => sense.synonyms ?? []).filter(Boolean)));
  const antonyms = Array.from(new Set(senses.flatMap((sense) => sense.antonyms ?? []).filter(Boolean)));
  return [
    ...(synonyms.length > 0 ? [{ label: 'Synonyms', labelKey: 'dictionaryGroupSynonyms', lines: [synonyms.join('; ')] }] : []),
    ...(antonyms.length > 0 ? [{ label: 'Antonyms', labelKey: 'dictionaryGroupAntonyms', lines: [antonyms.join('; ')] }] : []),
  ];
}

function collectExamplesFromEnglishSenses(senses: EnglishSenseDetail[]): string[] {
  return Array.from(new Set(senses.flatMap((sense) => sense.examples ?? []).map(cleanSentenceText).filter(Boolean)));
}

function cleanHtmlText(value: string | null | undefined): string {
  return cleanSentenceText((value ?? '').replace(/<[^>]*>/g, ' '));
}

function summarizeDictionaryEntry(entry: DictionaryEntry): Record<string, unknown> {
  const firstMeaning = entry.meanings[0];
  const firstSection = entry.sections?.[0];
  return {
    source: entry.source,
    word: entry.word,
    phonetic: entry.phonetic,
    meaningCount: entry.meanings.length,
    sectionCount: entry.sections?.length ?? 0,
    exampleCount: entry.examples?.length ?? 0,
    firstPartOfSpeech: firstMeaning?.partOfSpeech,
    firstDefinition: firstMeaning?.definitions[0],
    firstSectionTitle: firstSection?.title,
    firstSectionLabel: firstSection?.groups[0]?.label,
    firstSectionLine: firstSection?.groups[0]?.lines[0],
    meanings: entry.meanings,
    sections: entry.sections,
  };
}

function emitDictionaryLookupLog(
  logEvent: DictionaryLookupLog | undefined,
  event: string,
  details: Record<string, unknown>,
): void {
  try {
    void logEvent?.(event, details);
  } catch {
    // Logging must not affect dictionary lookup.
  }
}

function dedupeTranslationDetails(details: TargetTranslationDetail[]): TargetTranslationDetail[] {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = [
      detail.partOfSpeech,
      detail.word,
      detail.roman,
      detail.alt,
      detail.sense,
      detail.definition,
    ].join('\u0000');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function groupByPartOfSpeech<T extends { partOfSpeech: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const partOfSpeech = normalizePartOfSpeechLabel(item.partOfSpeech);
    grouped.set(partOfSpeech, [...(grouped.get(partOfSpeech) ?? []), item]);
  }
  return grouped;
}

function normalizePartOfSpeechLabel(value: string | undefined): string {
  const normalized = cleanText(value).toLowerCase();
  const labels: Record<string, string> = {
    noun: 'n.',
    n: 'n.',
    'n.': 'n.',
    verb: 'v.',
    v: 'v.',
    'v.': 'v.',
    adjective: 'adj.',
    adj: 'adj.',
    'adj.': 'adj.',
    adverb: 'adv.',
    adv: 'adv.',
    'adv.': 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    interjection: 'interj.',
    determiner: 'det.',
    article: 'art.',
    prefix: 'pref.',
    suffix: 'suff.',
    numeral: 'num.',
    phrase: 'phr.',
    meaning: 'meaning',
    '名詞': 'n.',
    '動詞': 'v.',
    '形容詞': 'adj.',
    '副詞': 'adv.',
    '代名詞': 'pron.',
    '前置詞': 'prep.',
    '接続詞': 'conj.',
    '感動詞': 'interj.',
    '接尾辞': 'suff.',
    '接頭辞': 'pref.',
    '명사': 'n.',
    '동사': 'v.',
    '형용사': 'adj.',
    '부사': 'adv.',
    '대명사': 'pron.',
    '전치사': 'prep.',
    '접속사': 'conj.',
    '감탄사': 'interj.',
    'संज्ञा': 'n.',
    'क्रिया': 'v.',
    'विशेषण': 'adj.',
    'क्रिया विशेषण': 'adv.',
  };
  return labels[normalized] ?? (cleanText(value) || 'meaning');
}

function formatTranslationDetail(detail: TargetTranslationDetail): string {
  const hints = [detail.roman, detail.alt].map(cleanText).filter(Boolean);
  const tagText = detail.tags && detail.tags.length > 0 ? ` [${detail.tags.join(', ')}]` : '';
  const sense = cleanText(detail.sense || detail.definition);
  return [
    `${detail.word}${hints.length > 0 ? ` (${Array.from(new Set(hints)).join('; ')})` : ''}${tagText}`,
    sense,
  ].filter(Boolean).join(' - ');
}

function formatEnglishSense(sense: EnglishSenseDetail): string {
  const tagText = sense.tags && sense.tags.length > 0 ? `[${sense.tags.join(', ')}] ` : '';
  return `${tagText}${sense.definition}`;
}

function getFreeDictionaryApiComPronunciation(data: FreeDictionaryApiComResponse | null): { phonetic?: string; remoteUrl?: string } | null {
  const pronunciations = data?.entries?.flatMap((entry) => entry.pronunciations ?? []) ?? [];
  const usPronunciation =
    pronunciations.find((pronunciation) => pronunciation.tags?.some((tag) => /general american|us|american/i.test(tag))) ??
    pronunciations.find((pronunciation) => pronunciation.text || pronunciation.audio);
  const phonetic = cleanPhonetic(usPronunciation?.text);
  const remoteUrl = normalizeAudioUrl(usPronunciation?.audio);
  return phonetic || remoteUrl ? { phonetic, remoteUrl } : null;
}

function getWiktApiTargetCodes(targetLanguage: DictionaryTargetLanguage): string[] {
  if (targetLanguage === 'zh-CN' || targetLanguage === 'zh-Hant') {
    return ['cmn', 'zh'];
  }
  return [targetLanguage];
}

function toGoogleTranslateLanguageCode(targetLanguage: DictionaryTargetLanguage): string {
  if (targetLanguage === 'zh-Hant') {
    return 'zh-TW';
  }
  return targetLanguage;
}

function isChineseDictionaryTargetLanguage(targetLanguage: DictionaryTargetLanguage): boolean {
  return targetLanguage === 'zh-CN' || targetLanguage === 'zh-Hant';
}

function isTargetTranslation(
  translation: WiktApiTranslation,
  targetCodes: string[],
  targetLanguage: DictionaryTargetLanguage,
): boolean {
  const code = translation.code ?? translation.lang_code;
  if (!code || !targetCodes.includes(code)) {
    return false;
  }
  return isLikelyTargetText(translation.word, targetLanguage, translation.lang);
}

function isLikelyTargetText(value: string | undefined, targetLanguage: DictionaryTargetLanguage, languageName?: string): boolean {
  if (!value) {
    return false;
  }
  if (targetLanguage === 'zh-CN' || targetLanguage === 'zh-Hant') {
    return /[\u3400-\u9fff]/.test(value) && !/Dungan/i.test(languageName ?? '');
  }
  if (targetLanguage === 'ja') {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
  }
  if (targetLanguage === 'ko') {
    return /[\uac00-\ud7af]/.test(value);
  }
  if (targetLanguage === 'ru') {
    return /[\u0400-\u04ff]/.test(value);
  }
  return true;
}

function normalizeTranslatedWord(value: string | undefined, targetLanguage: DictionaryTargetLanguage): string {
  const word = cleanText(value);
  if (!word) {
    return '';
  }
  if (targetLanguage === 'zh-Hant') {
    return pickSlashVariant(word, 'first');
  }
  if (targetLanguage === 'zh-CN') {
    return pickSlashVariant(word, 'last');
  }
  return word;
}

function pickSlashVariant(value: string, side: 'first' | 'last'): string {
  const parts = value.split('/').map((part) => cleanText(part)).filter(Boolean);
  if (parts.length <= 1) {
    return value;
  }
  return side === 'first' ? parts[0] : parts[parts.length - 1];
}

function createWikimediaAudioUrl(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}`;
}

function mergeDictionaryPronunciation(primary: DictionaryEntry, pronunciationEntry: DictionaryEntry | null): DictionaryEntry {
  if (!pronunciationEntry) {
    return primary;
  }

  return {
    ...primary,
    phonetic: primary.phonetic ?? pronunciationEntry.phonetic,
    audio: primary.audio ?? pronunciationEntry.audio,
  };
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanPhonetic(value: string | null | undefined): string {
  const phonetic = cleanText(value).replace(/^(美|英|US|UK)\s*[:：]\s*/i, '');
  return isValidPhonetic(phonetic) ? phonetic : '';
}

function cleanSentenceText(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/\s+'\s*/g, "'");
}

function normalizeAudioUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.startsWith('//') ? `https:${value}` : value;
}

function isValidPhonetic(value: string): boolean {
  if (!value || value.length > 80 || isScriptJunkText(value)) return false;
  return /^[\sA-Za-zˈˌəɚɝɪʊʌɔɑæɛɜɒθðʃʒŋɡɫɹɾʔː:.'\\/\[\]（）()-]+$/.test(value);
}

function isScriptJunkText(value: string): boolean {
  return /(?:function|document|encodeURIComponent|decodeURIComponent|clickEX|_w\.|_G\.|var\s+|for\s*\(|=>|&&|\|\|)/.test(value);
}

function normalizeDictionaryWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
    .trim();
}

export function normalizeDictionaryTargetLanguage(value: string | undefined): DictionaryTargetLanguage {
  const supported = DICTIONARY_TARGET_LANGUAGES.find((language) => language.code === value);
  return supported?.code ?? DEFAULT_DICTIONARY_TARGET_LANGUAGE;
}

function createDictionaryCacheKey(normalizedWord: string, targetLanguage: DictionaryTargetLanguage): string {
  return `${targetLanguage}:${normalizedWord}`;
}

function readCachedDictionaryEntry(normalizedWord: string, targetLanguage: DictionaryTargetLanguage): DictionaryEntry | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cache = JSON.parse(window.localStorage.getItem(DICTIONARY_CACHE_KEY) ?? '{}') as DictionaryCache;
    const cached = cache[createDictionaryCacheKey(normalizedWord, targetLanguage)];
    if (!cached || Date.now() - cached.cachedAt > DICTIONARY_CACHE_TTL_MS) {
      return null;
    }
    return cached.entry;
  } catch {
    return null;
  }
}

function writeCachedDictionaryEntry(normalizedWord: string, targetLanguage: DictionaryTargetLanguage, entry: DictionaryEntry): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cache = JSON.parse(window.localStorage.getItem(DICTIONARY_CACHE_KEY) ?? '{}') as DictionaryCache;
    cache[createDictionaryCacheKey(normalizedWord, targetLanguage)] = { entry, cachedAt: Date.now() };
    const keys = Object.keys(cache).sort((left, right) => cache[right].cachedAt - cache[left].cachedAt);
    for (const staleKey of keys.slice(200)) {
      delete cache[staleKey];
    }
    window.localStorage.setItem(DICTIONARY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures; dictionary lookup should still work.
  }
}
