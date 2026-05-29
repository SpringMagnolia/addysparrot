import { normalizeLookupWord } from './dictionary';
import { platformBridge } from './platformBridge';
import type { AudioAssetRef, DictionaryEntry, FavoriteWord } from './types';
import { normalizeTimestamp } from './formatUtils';
import { pickAudioAssetRef, pickDictionaryEntry, pickLongerText } from './reviewUtils';

export { pickLongerText, pickDictionaryEntry, pickAudioAssetRef };

export function createWordNoteMap(words: FavoriteWord[]): Map<string, string> {
  const notes = new Map<string, string>();
  const sortedWords = [...words].sort((left, right) => (normalizeTimestamp(right.createdAt) ?? 0) - (normalizeTimestamp(left.createdAt) ?? 0));
  for (const word of sortedWords) {
    const wordKey = normalizeLookupWord(word.word);
    const note = word.wordNote?.trim();
    if (wordKey && note && !notes.has(wordKey)) {
      notes.set(wordKey, note);
    }
  }
  return notes;
}

export async function cacheDictionaryEntryAudioForFavorite(
  entry: DictionaryEntry | null | undefined,
): Promise<DictionaryEntry | null | undefined> {
  if (!entry?.audio?.remoteUrl) return entry;
  const cachedAudio = await platformBridge.audio.cacheRemoteAudioAsset(entry.audio.remoteUrl);
  if (!cachedAudio) {
    return {
      ...entry,
      audio: {
        remoteUrl: entry.audio.remoteUrl,
        status: 'missing',
        updatedAt: Date.now(),
      },
    };
  }
  return {
    ...entry,
    audio: cachedAudio,
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(input.type);
  }

  return (
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}
