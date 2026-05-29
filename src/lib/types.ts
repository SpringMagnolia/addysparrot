export interface CaptionWord {
  id: string;
  text: string;
  start: number;
  duration: number;
  end: number;
}

export interface CaptionLine {
  id: string;
  text: string;
  start: number;
  duration: number;
  end: number;
  source: string;
  words?: CaptionWord[];
}

export interface CaptionSegment {
  id: string;
  text: string;
  start: number;
  duration: number;
  end: number;
  source: string;
  lines?: CaptionLine[];
  words?: CaptionWord[];
}

export interface CaptionTrack {
  videoId: string;
  language: string;
  provider: string;
  fetchedAt: number;
  updatedAt: number;
  deletedAt?: number;
  segments: CaptionSegment[];
}

export interface TranscriptJobSnapshot {
  status: 'not_started' | 'queued' | 'running' | 'complete' | 'error' | 'cancelled';
  stage:
    | 'video_added'
    | 'media_import'
    | 'audio_download'
    | 'audio_extract'
    | 'transcription'
    | 'post_processing'
    | 'complete'
    | 'error'
    | 'cancelled';
  segmentCount: number;
  updatedAt: number;
  error?: string;
}

export interface SavedVideo {
  id: string;
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  createdAt: number;
  lastOpenedAt?: number;
  sourceType?: 'youtube' | 'local';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  contentFingerprint?: string;
  hasAudio?: boolean;
  audioCodec?: string;
  transcriptJob?: TranscriptJobSnapshot;
  updatedAt: number;
  deletedAt?: number;
}

export interface FavoriteWord {
  id: string;
  word: string;
  sentence?: string;
  videoId?: string;
  segmentId?: string;
  phonetic?: string;
  definition?: string;
  dictionaryEntry?: DictionaryEntry;
  audio?: AudioAssetRef;
  sentenceAudio?: AudioAssetRef;
  note?: string;
  wordNote?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface FavoriteSentence {
  id: string;
  text: string;
  videoId: string;
  segmentId: string;
  start?: number;
  end?: number;
  audio?: AudioAssetRef;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SentenceNote {
  id: string;
  videoId: string;
  segmentId: string;
  text: string;
  updatedAt: number;
  deletedAt?: number;
}

export interface StudyProgress {
  videoId: string;
  lastSegmentId: string | null;
  playedSegmentIds: string[];
  updatedAt: number;
}

export interface ReviewProgress {
  id: string;
  kind: 'word' | 'sentence';
  itemKey: string;
  stage: number;
  dueAt: number;
  lastReviewedAt?: number;
  rememberCorrectCount: number;
  spellingCorrectCount: number;
  totalReviews: number;
  updatedAt: number;
}

export type ReviewCardState = 'New' | 'Learning' | 'Review' | 'Relearning';
export type ReviewLogRating = 'forgot' | 'remembered' | 'easy';

export interface ReviewCard {
  id: string;
  kind: 'word' | 'sentence';
  itemKey: string;
  dueAt: number;
  state: ReviewCardState;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  firstReviewedAt?: number;
  lastReviewedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  itemKey: string;
  kind: 'word' | 'sentence';
  rating: ReviewLogRating;
  reviewedAt: number;
  scheduledDays: number;
  elapsedDays: number;
  stability: number;
  difficulty: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ReviewSettings {
  desiredRetention: number;
  sessionBatchSize: number;
  historyDebtDailyBase: number;
  historyDebtCatchUpDays: number;
  favoriteRetentionDays: number;
  videoRetentionDays: number;
  forgotRetryHours: number;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  audio?: AudioAssetRef;
  source?: string;
  inflections?: string[];
  examples?: Array<{
    en: string;
    zh?: string;
  }>;
  sections?: DictionarySection[];
  meanings: Array<{
    partOfSpeech: string;
    definitions: string[];
  }>;
}

export interface AudioAssetRef {
  assetId?: string;
  remoteUrl?: string;
  mimeType?: string;
  status?: 'available' | 'missing';
  updatedAt?: number;
}

export interface DictionarySection {
  title: string;
  titleKey?: string;
  groups: Array<{
    label?: string;
    labelKey?: string;
    lines: string[];
  }>;
}
