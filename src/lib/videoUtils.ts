import { platformBridge } from './platformBridge';
import type { SavedVideo } from './types';
import type { Translator } from './i18n/context';
import { detectSystemLanguage } from './i18n';
import { DEFAULT_DICTIONARY_TARGET_LANGUAGE, normalizeDictionaryTargetLanguage } from './dictionary';
import { getAppSetting } from './storage';

export const WORD_UNDERLINE_SETTING_ID = 'wordUnderlineEnabled';
export const DICTIONARY_TARGET_LANGUAGE_SETTING_ID = 'dictionaryTargetLanguage';

export async function loadDictionaryTargetLanguageSetting(): Promise<string> {
  try {
    const saved = await getAppSetting<string>(DICTIONARY_TARGET_LANGUAGE_SETTING_ID);
    return saved ? normalizeDictionaryTargetLanguage(saved) : detectSystemLanguage();
  } catch {
    return detectSystemLanguage() || DEFAULT_DICTIONARY_TARGET_LANGUAGE;
  }
}

export async function fetchVideoMetadata(videoId: string): Promise<{ title: string; thumbnailUrl?: string } | null> {
  return platformBridge.video.getYouTubeMetadata(videoId);
}

export function trimFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

export function createLocalVideoId(fingerprint: string): string {
  return `local_${fingerprint.slice(0, 24)}`;
}

export async function calculateFileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getLocalAudioWarning(video: SavedVideo, t: Translator): string | null {
  if (video.hasAudio === false) {
    return t('localVideoNoAudio');
  }

  if (video.audioCodec && !isLikelyBrowserAudioCodec(video.audioCodec)) {
    return t('localVideoUnsupportedAudio', { codec: video.audioCodec });
  }

  return null;
}

export function isLikelyBrowserAudioCodec(codec: string): boolean {
  return ['aac', 'mp3', 'mp4a', 'opus', 'vorbis'].some((supported) => codec.toLowerCase().includes(supported));
}
