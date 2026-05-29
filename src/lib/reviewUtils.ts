import { normalizeLookupWord } from './dictionary';
import { formatReviewDueAt, findExpiredFavoriteIds, migrateReviewProgressToCards } from './review';
import type { AudioAssetRef, DictionaryEntry, FavoriteSentence, FavoriteWord, ReviewCard, ReviewLog, SavedVideo } from './types';
import { normalizeTimestamp, formatRelativeReviewDate } from './formatUtils';
import { tokenize } from './captionUtils';
import {
  deleteFavoriteWord,
  deleteFavoriteSentence,
  listFavoriteWords,
  listFavoriteSentences,
  listReviewCards,
  listReviewLogs,
  listReviewProgress,
  saveReviewCard,
} from './storage';

export type WordReviewItem = {
  word: string;
  phonetic?: string;
  definition?: string;
  dictionaryEntry?: DictionaryEntry;
  wordNote?: string;
  audio?: AudioAssetRef;
  createdAt: number;
  examples: FavoriteWord[];
  ids: string[];
};

export type ReviewEntry =
  | { kind: 'word'; id: string; createdAt: number; item: WordReviewItem }
  | { kind: 'sentence'; id: string; createdAt: number; item: FavoriteSentence };

export function createReviewEntries(words: FavoriteWord[], sentences: FavoriteSentence[]): ReviewEntry[] {
  const wordGroups = groupFavoriteWords(words);
  return [
    ...wordGroups.map((group) => ({
      kind: 'word' as const,
      id: group.ids.join('|'),
      createdAt: group.createdAt,
      item: group,
    })),
    ...sentences.map((sentence) => ({
      kind: 'sentence' as const,
      id: sentence.id,
      createdAt: normalizeTimestamp(sentence.createdAt) ?? 0,
      item: sentence,
    })),
  ].sort((a, b) => (normalizeTimestamp(b.createdAt) ?? 0) - (normalizeTimestamp(a.createdAt) ?? 0));
}

export function groupReviewEntries(
  entries: ReviewEntry[],
  t: (key: string) => string,
): Array<{ dateKey: string; label: string; entries: ReviewEntry[] }> {
  const groups = new Map<string, ReviewEntry[]>();

  entries.forEach((entry) => {
    const timestamp = normalizeTimestamp(entry.createdAt);
    if (timestamp === null) {
      groups.set('unknown', [...(groups.get('unknown') ?? []), entry]);
      return;
    }

    const date = new Date(timestamp);
    const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), entry]);
  });

  return Array.from(groups.entries()).map(([dateKey, groupEntries]) => {
    const timestamp = normalizeTimestamp(groupEntries[0].createdAt);
    return {
      dateKey,
      label: timestamp === null ? t('unknownDate') : formatRelativeReviewDate(timestamp),
      entries: groupEntries,
    };
  });
}

export function groupFavoriteWords(words: FavoriteWord[]): WordReviewItem[] {
  const groups = new Map<string, WordReviewItem>();

  words.forEach((word) => {
    const wordKey = normalizeLookupWord(word.word);
    const hasSentence = Boolean(word.sentence?.trim());
    const existing = groups.get(wordKey);
    const createdAt = normalizeTimestamp(word.createdAt) ?? 0;

    if (!existing) {
      groups.set(wordKey, {
        word: word.word,
        phonetic: word.phonetic,
        definition: word.definition,
        dictionaryEntry: word.dictionaryEntry,
        wordNote: word.wordNote,
        audio: pickAudioAssetRef(word.audio, word.dictionaryEntry?.audio),
        createdAt,
        examples: hasSentence ? [word] : [],
        ids: [word.id],
      });
      return;
    }

    existing.createdAt = Math.max(existing.createdAt, createdAt);
    existing.phonetic = existing.phonetic ?? word.phonetic;
    existing.definition = pickLongerText(existing.definition, word.definition);
    existing.dictionaryEntry = pickDictionaryEntry(existing.dictionaryEntry, word.dictionaryEntry);
    existing.wordNote = existing.wordNote ?? word.wordNote;
    existing.audio = pickAudioAssetRef(existing.audio, pickAudioAssetRef(word.audio, word.dictionaryEntry?.audio));

    existing.ids.push(word.id);
    if (!hasSentence) {
      return;
    }

    const sameExampleIndex = existing.examples.findIndex(
      (example) => normalizeSentence(example.sentence ?? '') === normalizeSentence(word.sentence ?? ''),
    );
    if (sameExampleIndex < 0) {
      existing.examples.push(word);
    } else if (
      (!existing.examples[sameExampleIndex].sentenceAudio && word.sentenceAudio) ||
      (!existing.examples[sameExampleIndex].note && word.note)
    ) {
      existing.examples[sameExampleIndex] = {
        ...existing.examples[sameExampleIndex],
        ...word,
      };
    }
    existing.examples.sort((a, b) => (normalizeTimestamp(b.createdAt) ?? 0) - (normalizeTimestamp(a.createdAt) ?? 0));
  });

  return Array.from(groups.values());
}

export function mergeById<T extends { id: string; createdAt: number }>(current: T[], nextItems: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of nextItems) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort(
    (left, right) => (normalizeTimestamp(right.createdAt) ?? 0) - (normalizeTimestamp(left.createdAt) ?? 0),
  );
}

export function createFavoriteWordKey(word: string, sentence?: string | null): string {
  return `${normalizeLookupWord(word)}:${sentence ? normalizeSentence(sentence) : '__standalone__'}`;
}

export function getCurrentReviewStatusLabel(dueAt: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  return dueAt <= Date.now()
    ? t('currentReviewDueNow')
    : t('currentReviewEarly', { time: formatReviewDueAt(dueAt, t) });
}

export function sentenceContainsWord(sentence: string, word: string): boolean {
  const normalizedWord = normalizeLookupWord(word);
  if (!normalizedWord) return false;

  return tokenize(sentence).some((token) => token.isWord && normalizeLookupWord(token.value) === normalizedWord);
}

export function normalizeSentence(sentence: string): string {
  return sentence.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function pickLongerText(current: string | undefined, next: string | undefined): string | undefined {
  if (!current) return next;
  if (!next) return current;
  return next.length > current.length ? next : current;
}

export function pickDictionaryEntry(
  current: DictionaryEntry | undefined,
  next: DictionaryEntry | null | undefined,
): DictionaryEntry | undefined {
  if (!current) return next ?? undefined;
  if (!next) return current;
  const currentScore = (current.sections?.length ?? 0) + (current.examples?.length ?? 0);
  const nextScore = (next.sections?.length ?? 0) + (next.examples?.length ?? 0);
  return nextScore > currentScore ? next : current;
}

export function pickAudioAssetRef(
  current: AudioAssetRef | undefined,
  next: AudioAssetRef | undefined,
): AudioAssetRef | undefined {
  if (!current) return next;
  if (!next) return current;
  if (current.status !== 'available' && next.status === 'available') return next;
  if (!current.assetId && next.assetId) return next;
  if (!current.remoteUrl && next.remoteUrl) return { ...current, remoteUrl: next.remoteUrl };
  return current;
}

export async function loadMaintainedReviewData(): Promise<{
  words: FavoriteWord[];
  sentences: FavoriteSentence[];
  cards: ReviewCard[];
  logs: ReviewLog[];
}> {
  let [words, sentences, cards, logs, progressList] = await Promise.all([
    listFavoriteWords(),
    listFavoriteSentences(),
    listReviewCards(),
    listReviewLogs(),
    listReviewProgress(),
  ]);

  const migratedCards = migrateReviewProgressToCards(progressList, cards);
  if (migratedCards.length > 0) {
    await Promise.all(migratedCards.map((card) => saveReviewCard(card)));
    cards = [...cards, ...migratedCards];
  }

  const expired = findExpiredFavoriteIds(words, sentences, cards, logs);
  if (expired.wordIds.length > 0 || expired.sentenceIds.length > 0) {
    await Promise.all([
      ...expired.wordIds.map((id) => deleteFavoriteWord(id)),
      ...expired.sentenceIds.map((id) => deleteFavoriteSentence(id)),
    ]);
    [words, sentences] = await Promise.all([listFavoriteWords(), listFavoriteSentences()]);
  }

  return { words, sentences, cards, logs };
}

export function transcriptJobPersistenceKey(job: NonNullable<SavedVideo['transcriptJob']>): string {
  return JSON.stringify({
    status: job.status,
    stage: job.stage,
    segmentCount: job.segmentCount,
    error: job.error ?? null,
  });
}
