import type { DictionaryEntry, SavedVideo } from './types';
import type { UserBackupResult, UserDataClearResult } from './platformBridge';
import type { Translator } from './i18n/context';

export function formatFileSize(size: number | undefined, t: Translator): string {
  if (size === undefined || size < 0) {
    return t('unknownSize');
  }
  if (size === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? Math.round(value).toString() : value.toFixed(value >= 10 ? 1 : 2);
  return `${formatted} ${units[unitIndex]}`;
}

export function formatBackupResultMessage(kind: 'export' | 'import', result: UserBackupResult, t: Translator): string {
  const params = {
    words: result.favoriteWordCount ?? 0,
    sentences: result.favoriteSentenceCount ?? 0,
    reviews: result.reviewProgressCount ?? 0,
    history: result.reviewLogCount ?? 0,
    audio: result.audioCount ?? 0,
  };
  return kind === 'export'
    ? t('backupExportDone', params)
    : t('backupImportDone', params);
}

export function formatClearDataResultMessage(kind: 'video' | 'learning', result: UserDataClearResult, t: Translator): string {
  return kind === 'video'
    ? t('clearVideoDataDone', { count: result.totalCount })
    : t('clearLearningDataDone', { count: result.totalCount });
}

export function formatVideoLibraryMeta(video: SavedVideo, t: Translator): string {
  return [
    formatRelativeDateTime(video.createdAt, t),
    video.sourceType === 'local' ? t('localVideo') : 'YouTube',
  ].join(' · ');
}

export function formatRelativeDateTime(value: number, t: Translator): string {
  if (!Number.isFinite(value) || value <= 0) {
    return t('unknownTime');
  }

  const date = new Date(value);
  const time = formatTimeOfDay(value);
  const dayLabel = formatNearDayLabel(value);

  if (dayLabel) {
    return `${dayLabel} ${time}`;
  }

  return `${new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)} ${time}`;
}

export function formatRelativeReviewDate(value: number): string {
  const dayLabel = formatNearDayLabel(value);
  if (dayLabel) return capitalizeFirstLetter(dayLabel);

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(value));
}

export function capitalizeFirstLetter(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;
}

export function formatReviewSessionMetaDate(value: number, t: Translator): string {
  if (!Number.isFinite(value) || value <= 0) {
    return t('unknownTime');
  }

  const time = formatTimeOfDay(value);
  const dayDiff = getLocalDayDiff(value);
  if (dayDiff === 0 || dayDiff === 1) {
    return `${formatRelativeDayLabel(dayDiff)} ${time}`;
  }

  const date = new Date(value);
  const currentYear = new Date().getFullYear();
  const itemYear = date.getFullYear();

  return new Intl.DateTimeFormat(undefined, {
    ...(itemYear === currentYear ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatNearDayLabel(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const diffDays = getLocalDayDiff(value);
  if (diffDays === 0 || diffDays === 1 || diffDays === 2) {
    return formatRelativeDayLabel(diffDays);
  }
  return null;
}

export function getLocalDayDiff(value: number): number {
  return Math.round((startOfLocalDay(Date.now()) - startOfLocalDay(value)) / 86400000);
}

export function formatRelativeDayLabel(diffDays: number): string {
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffDays, 'day');
}

export function startOfLocalDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatTimeOfDay(timestamp: number): string {
  const normalized = normalizeTimestamp(timestamp);
  if (normalized === null) {
    return '--:--';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(normalized));
}

export function normalizeTimestamp(value: unknown): number | null {
  const timestamp =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  if (Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime())) {
    return timestamp;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime())) {
      return parsed;
    }
  }

  return null;
}

export function formatTranscodeRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatPhonetic(value: string | null | undefined): string {
  return (value ?? '').replace(/^(美|英|US|UK)\s*[:：]\s*/i, '').trim();
}

export function formatDefinitionPreview(definition: string): string {
  const lines = definition
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return definition;

  const firstDefinitionIndex = lines.findIndex((line) => line.startsWith('- '));
  if (firstDefinitionIndex < 0) {
    return lines[0];
  }

  const partOfSpeech = firstDefinitionIndex > 0 ? lines[firstDefinitionIndex - 1] : '';
  const firstDefinition = lines[firstDefinitionIndex].replace(/^- /, '');
  return partOfSpeech ? `${partOfSpeech}. ${firstDefinition}` : firstDefinition;
}

export function formatDictionaryDefinition(entry: DictionaryEntry | null | undefined): string | undefined {
  if (!entry) return undefined;
  if (entry.sections?.length) {
    return entry.sections
      .map((section) => {
        const groups = section.groups
          .map((group) => {
            const lines = group.lines.map((line) => `- ${line}`).join('\n');
            return [group.label, lines].filter(Boolean).join('\n');
          })
          .filter(Boolean)
          .join('\n');
        return [section.title, groups].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (!entry.meanings.length) return undefined;
  return entry.meanings
    .map((meaning) => {
      const definitions = meaning.definitions.map((definition) => `- ${definition}`).join('\n');
      return `${meaning.partOfSpeech}\n${definitions}`;
    })
    .join('\n\n');
}
