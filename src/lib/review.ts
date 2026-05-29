import { normalizeLookupWord } from './dictionary';
import { scheduleReview, type ReviewRating } from './reviewAlgorithm';
import type {
  AudioAssetRef,
  DictionaryEntry,
  FavoriteSentence,
  FavoriteWord,
  ReviewCard,
  ReviewCardState,
  ReviewLog,
  ReviewProgress,
  ReviewSettings,
  SavedVideo,
  StudyProgress,
} from './types';

export type { ReviewRating } from './reviewAlgorithm';

export type ReviewableItem =
  | {
      kind: 'word';
      key: string;
      label: string;
      expectedAnswer: string;
      createdAt: number;
      word: string;
      phonetic?: string;
      definition?: string;
      dictionaryEntry?: DictionaryEntry;
      wordNote?: string;
      audio?: AudioAssetRef;
      examples: FavoriteWord[];
      ids: string[];
    }
  | {
      kind: 'sentence';
      key: string;
      label: string;
      expectedAnswer: string;
      createdAt: number;
      sentence: FavoriteSentence;
    };

export interface ReviewSessionItem {
  item: ReviewableItem;
  card?: ReviewCard;
  dueAt: number;
  isNew: boolean;
  queue: 'retry' | 'due' | 'new' | 'upcoming';
}

export interface ReviewOverview {
  totalItems: number;
  dailyTarget: number;
  reviewedTodayCount: number;
  extraReviewedTodayCount: number;
  todayRatingCounts: Record<ReviewRating, number>;
  historyDebtCount: number;
  dueReviewCount: number;
  forgottenRetryCount: number;
  expiringNewPressure: number;
  newCount: number;
  expiringNewCount: number;
  tomorrowReviewCount: number;
  scheduledCount: number;
  masteredCount: number;
  familiarTotalCount: number;
  completedTotalCount: number;
}

type ReviewTranslator = (key: string, params?: Record<string, string | number>) => string;

export const REVIEW_SETTINGS: ReviewSettings = {
  desiredRetention: 0.9,
  sessionBatchSize: 10,
  historyDebtDailyBase: 60,
  historyDebtCatchUpDays: 5,
  favoriteRetentionDays: 28,
  videoRetentionDays: 14,
  forgotRetryHours: 4,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const S_MAX = 36500;

export function createReviewSessionItems(
  words: FavoriteWord[],
  sentences: FavoriteSentence[],
  cards: ReviewCard[],
  logs: ReviewLog[],
  now = Date.now(),
  batchSize = REVIEW_SETTINGS.sessionBatchSize,
  includeUpcoming = false,
): ReviewSessionItem[] {
  const items = createReviewableItems(words, sentences);
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const cardByKey = new Map(cards.map((card) => [card.itemKey, card]));
  const reviewedKeys = createReviewedKeySet(cards, logs);
  const lastLogByCard = createLastLogByCard(logs);

  const retryItems: ReviewSessionItem[] = [];
  const dueItems: ReviewSessionItem[] = [];
  const newItems: ReviewSessionItem[] = [];
  const upcomingItems: ReviewSessionItem[] = [];

  for (const card of cards) {
    const item = itemByKey.get(card.itemKey);
    if (!item) continue;
    const entry: ReviewSessionItem = {
      item,
      card,
      dueAt: card.dueAt,
      isNew: false,
      queue: 'due',
    };
    if (card.dueAt <= now) {
      const lastLog = lastLogByCard.get(card.id);
      if (lastLog?.rating === 'forgot' && isSameLocalDay(lastLog.reviewedAt, now)) {
        retryItems.push({ ...entry, queue: 'retry' });
      } else {
        dueItems.push(entry);
      }
    } else if (includeUpcoming) {
      upcomingItems.push({ ...entry, queue: 'upcoming' });
    }
  }

  for (const item of items) {
    if (reviewedKeys.has(item.key) || cardByKey.has(item.key)) continue;
    newItems.push({
      item,
      dueAt: item.createdAt,
      isNew: true,
      queue: 'new',
    });
  }

  retryItems.sort(sortByDueThenLastReview);
  dueItems.sort(sortByDueThenLastReview);
  newItems.sort((left, right) => cleanupDeadline(left.item.createdAt) - cleanupDeadline(right.item.createdAt));
  upcomingItems.sort((left, right) => left.dueAt - right.dueAt);

  return [...retryItems, ...dueItems, ...newItems, ...upcomingItems].slice(0, batchSize);
}

export function createReviewOverview(
  words: FavoriteWord[],
  sentences: FavoriteSentence[],
  cards: ReviewCard[],
  logs: ReviewLog[],
  now = Date.now(),
): ReviewOverview {
  const items = createReviewableItems(words, sentences);
  const reviewedKeys = createReviewedKeySet(cards, logs);
  const dayStart = startOfLocalDay(now);
  const dayEnd = dayStart + DAY_MS - 1;
  const tomorrowStart = dayStart + DAY_MS;
  const tomorrowEnd = tomorrowStart + DAY_MS - 1;
  let reviewedTodayCount = 0;
  let todayRatingCounts: Record<ReviewRating, number> = {
    forgot: 0,
    remembered: 0,
    easy: 0,
  };
  let historyDebtCount = 0;
  let todayDueReviewCount = 0;
  let dueReviewCount = 0;
  let forgottenRetryCount = 0;
  let scheduledCount = 0;
  let masteredCount = 0;
  let familiarTotalCount = 0;
  let expiringNewPressure = 0;
  let expiringNewCount = 0;
  let tomorrowExpiringNewPressure = 0;
  let newCount = 0;
  let tomorrowDueReviewCount = 0;

  const countedToday = new Set<string>();
  const latestLogByItem = new Map<string, ReviewLog>();
  for (const log of logs) {
    if (log.reviewedAt >= dayStart && log.reviewedAt <= now) {
      todayRatingCounts = {
        ...todayRatingCounts,
        [log.rating]: todayRatingCounts[log.rating] + 1,
      };
      if (!countedToday.has(log.itemKey)) {
        countedToday.add(log.itemKey);
        reviewedTodayCount += 1;
      }
    }
    const latestLog = latestLogByItem.get(log.itemKey);
    if (!latestLog || log.reviewedAt > latestLog.reviewedAt) latestLogByItem.set(log.itemKey, log);
  }
  familiarTotalCount = Array.from(latestLogByItem.values()).filter((log) => log.rating === 'easy').length;

  const lastLogByCard = createLastLogByCard(logs);
  for (const card of cards) {
    if (card.dueAt >= tomorrowStart && card.dueAt <= tomorrowEnd) tomorrowDueReviewCount += 1;
    if (card.dueAt >= dayStart && card.dueAt <= dayEnd) todayDueReviewCount += 1;
    const lastLog = lastLogByCard.get(card.id);
    const isForgottenRetry = lastLog?.rating === 'forgot' && isSameLocalDay(lastLog.reviewedAt, now) && card.dueAt > now && card.dueAt <= dayEnd;
    if (card.dueAt < dayStart) {
      historyDebtCount += 1;
    } else if (isForgottenRetry) {
      forgottenRetryCount += 1;
    } else if (card.dueAt <= now) {
      dueReviewCount += 1;
    } else {
      scheduledCount += 1;
    }
    if (card.stability >= 14 || card.scheduledDays >= 14) masteredCount += 1;
  }

  for (const item of items) {
    if (reviewedKeys.has(item.key)) continue;
    newCount += 1;
    const pressure = calculateNewItemPressure(item.createdAt, now);
    expiringNewPressure += pressure;
    tomorrowExpiringNewPressure += calculateNewItemPressure(item.createdAt, tomorrowStart);
    if (cleanupDeadline(item.createdAt) <= now + 7 * DAY_MS) expiringNewCount += 1;
  }

  const dailyTarget = calculateDailyTarget(items.length, historyDebtCount, dueReviewCount, expiringNewPressure);
  const tomorrowReviewCount = calculateDailyTarget(
    items.length,
    historyDebtCount + todayDueReviewCount,
    tomorrowDueReviewCount,
    tomorrowExpiringNewPressure,
  );

  return {
    totalItems: items.length,
    dailyTarget,
    reviewedTodayCount,
    extraReviewedTodayCount: Math.max(0, reviewedTodayCount - dailyTarget),
    todayRatingCounts,
    historyDebtCount,
    dueReviewCount,
    forgottenRetryCount,
    expiringNewPressure: Math.ceil(expiringNewPressure),
    newCount,
    expiringNewCount,
    tomorrowReviewCount,
    scheduledCount,
    masteredCount,
    familiarTotalCount,
    completedTotalCount: reviewedKeys.size,
  };
}

export function migrateReviewProgressToCards(progressList: ReviewProgress[], cards: ReviewCard[], now = Date.now()): ReviewCard[] {
  const existingKeys = new Set(cards.map((card) => card.itemKey));
  return progressList
    .filter((progress) => !existingKeys.has(progress.itemKey))
    .map((progress) => {
      const stability = Math.max(0.1, progress.stage <= 0 ? 0.212 : Math.min(S_MAX, progress.stage * 2));
      const dueAt = normalizeTimestamp(progress.dueAt) || now;
      return {
        id: progress.id || progress.itemKey,
        kind: progress.kind,
        itemKey: progress.itemKey,
        dueAt,
        state: 'Review',
        stability,
        difficulty: clamp(6 - progress.stage * 0.35, 1, 10),
        scheduledDays: Math.max(0, Math.round((dueAt - (progress.lastReviewedAt ?? now)) / DAY_MS)),
        elapsedDays: 0,
        reps: progress.totalReviews,
        lapses: 0,
        firstReviewedAt: progress.lastReviewedAt,
        lastReviewedAt: progress.lastReviewedAt,
        createdAt: progress.lastReviewedAt ?? now,
        updatedAt: Math.max(progress.updatedAt, now),
      } satisfies ReviewCard;
    });
}

export function applyReviewResult(
  item: ReviewableItem,
  card: ReviewCard | undefined,
  rating: ReviewRating,
  now = Date.now(),
): { card: ReviewCard; log: ReviewLog } {
  const baseCard = card ?? createInitialReviewCard(item, now);
  const elapsedDays = baseCard.lastReviewedAt ? Math.max(0, dateDiffInLocalDays(baseCard.lastReviewedAt, now)) : 0;
  const scheduled = scheduleReview(
    baseCard,
    rating,
    elapsedDays,
    now,
    REVIEW_SETTINGS,
  );
  const nextState: ReviewCardState = rating === 'forgot' ? 'Relearning' : 'Review';
  const nextCard: ReviewCard = {
    ...baseCard,
    dueAt: scheduled.dueAt,
    state: nextState,
    stability: scheduled.stability,
    difficulty: scheduled.difficulty,
    scheduledDays: scheduled.scheduledDays,
    elapsedDays,
    reps: baseCard.reps + 1,
    lapses: baseCard.lapses + (rating === 'forgot' ? 1 : 0),
    firstReviewedAt: baseCard.firstReviewedAt ?? now,
    lastReviewedAt: now,
    updatedAt: now,
  };
  return {
    card: nextCard,
    log: {
      id: createReviewLogId(item.key, rating, now),
      cardId: nextCard.id,
      itemKey: item.key,
      kind: item.kind,
      rating,
      reviewedAt: now,
      scheduledDays: scheduled.scheduledDays,
      elapsedDays,
      stability: scheduled.stability,
      difficulty: scheduled.difficulty,
      updatedAt: now,
    },
  };
}

export function previewReviewDueAt(item: ReviewableItem, card: ReviewCard | undefined, rating: ReviewRating, now = Date.now()): number {
  return applyReviewResult(item, card, rating, now).card.dueAt;
}

export function getReviewStageLabel(card: ReviewCard | undefined, t?: ReviewTranslator): string {
  if (!card) return t ? t('reviewStageNew') : 'New';
  return t ? t('reviewStageRound', { stage: card.reps }) : `Round ${card.reps}`;
}

export function formatReviewDueAt(dueAt: number, t?: ReviewTranslator, now = Date.now()): string {
  if (dueAt <= now) return t ? t('reviewDueNow') : 'now';

  const diff = dueAt - now;
  const minutes = Math.ceil(diff / (60 * 1000));
  if (minutes < 60) return t ? t('reviewDueMinutes', { count: minutes }) : `in ${minutes} minutes`;

  const hours = Math.ceil(diff / HOUR_MS);
  if (hours < 24) return t ? t('reviewDueHours', { count: hours }) : `in ${hours} hours`;

  const days = Math.ceil(diff / DAY_MS);
  return t ? t('reviewDueDays', { count: days }) : `in ${days} days`;
}

export function formatReviewTargetProgress(overview: ReviewOverview, t?: ReviewTranslator): string {
  if (overview.reviewedTodayCount < overview.dailyTarget) {
    return t
      ? t('todayReviewProgress', { count: overview.reviewedTodayCount, total: overview.dailyTarget })
      : `Today ${overview.reviewedTodayCount} / ${overview.dailyTarget}`;
  }
  return t
    ? t('todayReviewProgress', { count: overview.reviewedTodayCount, total: overview.dailyTarget })
    : `Today ${overview.reviewedTodayCount} / ${overview.dailyTarget}`;
}

export function findExpiredFavoriteIds(
  words: FavoriteWord[],
  sentences: FavoriteSentence[],
  cards: ReviewCard[],
  logs: ReviewLog[],
  now = Date.now(),
): { wordIds: string[]; sentenceIds: string[] } {
  const reviewedKeys = createReviewedKeySet(cards, logs);
  const cutoff = now - REVIEW_SETTINGS.favoriteRetentionDays * DAY_MS;
  const wordIds = words
    .filter((word) => {
      const key = createWordReviewKey(word.word);
      return key && normalizeTimestamp(word.createdAt) <= cutoff && !reviewedKeys.has(key);
    })
    .map((word) => word.id);
  const sentenceIds = sentences
    .filter((sentence) => {
      const key = `sentence:${sentence.id}`;
      return normalizeTimestamp(sentence.createdAt) <= cutoff && !reviewedKeys.has(key);
    })
    .map((sentence) => sentence.id);

  return { wordIds, sentenceIds };
}

export function findExpiredVideoIds(
  videos: SavedVideo[],
  studyProgressList: StudyProgress[],
  now = Date.now(),
): string[] {
  const progressByVideoId = new Map(studyProgressList.map((progress) => [progress.videoId, progress]));
  const cutoff = now - REVIEW_SETTINGS.videoRetentionDays * DAY_MS;
  return videos
    .filter((video) => {
      const progress = progressByVideoId.get(video.videoId) ?? progressByVideoId.get(video.id);
      const lastStudiedAt = progress?.updatedAt ?? video.lastOpenedAt ?? video.createdAt;
      return normalizeTimestamp(lastStudiedAt) <= cutoff;
    })
    .map((video) => video.id);
}

export function shouldCleanupAfterConsecutiveEasy(
  logs: ReviewLog[],
  itemKey: string,
  threshold = 3,
): boolean {
  const recentLogs = logs
    .filter((log) => log.itemKey === itemKey)
    .sort((left, right) => right.reviewedAt - left.reviewedAt)
    .slice(0, threshold);

  return recentLogs.length >= threshold && recentLogs.every((log) => log.rating === 'easy');
}

function createReviewableItems(words: FavoriteWord[], sentences: FavoriteSentence[]): ReviewableItem[] {
  return [
    ...groupFavoriteWordsForReview(words),
    ...sentences.map((sentence) => ({
      kind: 'sentence' as const,
      key: `sentence:${sentence.id}`,
      label: sentence.text,
      expectedAnswer: sentence.text,
      createdAt: normalizeTimestamp(sentence.createdAt),
      sentence,
    })),
  ].sort((left, right) => right.createdAt - left.createdAt);
}

function groupFavoriteWordsForReview(words: FavoriteWord[]): ReviewableItem[] {
  const groups = new Map<string, ReviewableItem & { kind: 'word' }>();

  for (const word of words) {
    const key = createWordReviewKey(word.word);
    if (!key) continue;

    const existing = groups.get(key);
    const createdAt = normalizeTimestamp(word.createdAt);
    const hasExample = Boolean(word.sentence?.trim());

    if (!existing) {
      groups.set(key, {
        kind: 'word',
        key,
        label: word.word,
        expectedAnswer: word.word,
        createdAt,
        word: word.word,
        phonetic: word.phonetic,
        definition: word.definition,
        dictionaryEntry: word.dictionaryEntry,
        wordNote: word.wordNote,
        audio: pickAudioAssetRef(word.audio, word.dictionaryEntry?.audio),
        examples: hasExample ? [word] : [],
        ids: [word.id],
      });
      continue;
    }

    existing.createdAt = Math.max(existing.createdAt, createdAt);
    existing.phonetic = existing.phonetic ?? word.phonetic;
    existing.definition = pickLongerText(existing.definition, word.definition);
    existing.dictionaryEntry = pickDictionaryEntry(existing.dictionaryEntry, word.dictionaryEntry);
    existing.wordNote = existing.wordNote ?? word.wordNote;
    existing.audio = pickAudioAssetRef(existing.audio, pickAudioAssetRef(word.audio, word.dictionaryEntry?.audio));
    if (!existing.ids.includes(word.id)) existing.ids.push(word.id);

    if (hasExample && !existing.examples.some((example) => normalizeText(example.sentence) === normalizeText(word.sentence))) {
      existing.examples.push(word);
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    examples: group.examples.sort((left, right) => normalizeTimestamp(right.createdAt) - normalizeTimestamp(left.createdAt)),
  }));
}

function createInitialReviewCard(item: ReviewableItem, now: number): ReviewCard {
  return {
    id: item.key,
    kind: item.kind,
    itemKey: item.key,
    dueAt: now,
    state: 'New',
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    elapsedDays: 0,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createReviewedKeySet(cards: ReviewCard[], logs: ReviewLog[]): Set<string> {
  const keys = new Set<string>();
  for (const card of cards) {
    if (card.reps > 0 || card.firstReviewedAt || card.lastReviewedAt) keys.add(card.itemKey);
  }
  for (const log of logs) keys.add(log.itemKey);
  return keys;
}

function createLastLogByCard(logs: ReviewLog[]): Map<string, ReviewLog> {
  const result = new Map<string, ReviewLog>();
  for (const log of logs) {
    const existing = result.get(log.cardId);
    if (!existing || existing.reviewedAt < log.reviewedAt) {
      result.set(log.cardId, log);
    }
  }
  return result;
}

function createWordReviewKey(word: string): string {
  const normalizedWord = normalizeLookupWord(word);
  return normalizedWord ? `word:${normalizedWord}` : '';
}

function sortByDueThenLastReview(left: ReviewSessionItem, right: ReviewSessionItem): number {
  const dueDiff = left.dueAt - right.dueAt;
  if (dueDiff !== 0) return dueDiff;
  return (left.card?.lastReviewedAt ?? 0) - (right.card?.lastReviewedAt ?? 0);
}

function cleanupDeadline(createdAt: number): number {
  return createdAt + REVIEW_SETTINGS.favoriteRetentionDays * DAY_MS;
}

function calculateNewItemPressure(createdAt: number, now: number): number {
  const remainingMs = cleanupDeadline(createdAt) - now;
  if (remainingMs <= 0) return 1;
  const remainingDays = Math.max(1, Math.ceil(remainingMs / DAY_MS));
  return 1 / remainingDays;
}

function calculateDailyTarget(totalItems: number, historyDebtCount: number, dueReviewCount: number, expiringNewPressure: number): number {
  if (totalItems <= 0) return 0;
  return calculateHistoryDebtPressure(historyDebtCount) + dueReviewCount + Math.ceil(expiringNewPressure);
}

function calculateHistoryDebtPressure(historyDebtCount: number): number {
  if (historyDebtCount <= 0) return 0;
  return Math.min(
    historyDebtCount,
    Math.max(
      REVIEW_SETTINGS.historyDebtDailyBase,
      Math.ceil(historyDebtCount / REVIEW_SETTINGS.historyDebtCatchUpDays),
    ),
  );
}

function createReviewLogId(itemKey: string, rating: ReviewRating, now: number): string {
  return `review-log:${itemKey}:${rating}:${now}:${Math.random().toString(16).slice(2, 8)}`;
}

function dateDiffInLocalDays(previous: number, current: number): number {
  return Math.floor((startOfLocalDay(current) - startOfLocalDay(previous)) / DAY_MS);
}

function isSameLocalDay(left: number, right: number): boolean {
  return startOfLocalDay(left) === startOfLocalDay(right);
}

function startOfLocalDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeTimestamp(value: unknown): number {
  const timestamp =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickLongerText(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.length > current.length ? candidate : current;
}

function pickDictionaryEntry(current: DictionaryEntry | undefined, candidate: DictionaryEntry | undefined): DictionaryEntry | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  const currentScore = current.sections?.length ?? current.meanings.length;
  const candidateScore = candidate.sections?.length ?? candidate.meanings.length;
  return candidateScore > currentScore ? candidate : current;
}

function pickAudioAssetRef(current: AudioAssetRef | undefined, candidate: AudioAssetRef | undefined): AudioAssetRef | undefined {
  if (isPlayableAudio(current)) return current;
  if (isPlayableAudio(candidate)) return candidate;
  return current ?? candidate;
}

function isPlayableAudio(audio: AudioAssetRef | undefined): boolean {
  return Boolean(audio && audio.status !== 'missing' && (audio.assetId || audio.remoteUrl));
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
