import { platformBridge } from './platformBridge';
import type { AudioAssetRef } from './types';

export class SentenceAudioError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SentenceAudioError';
  }
}

export async function createSentenceAudioAsset(options: {
  videoId: string;
  start: number;
  end: number;
  contentFingerprint?: string;
}): Promise<{ playableUrl: string; audio: AudioAssetRef }> {
  try {
    return await platformBridge.audio.createSentenceClipAsset(options);
  } catch (error) {
    throw new SentenceAudioError(
      error instanceof Error ? error.message : 'Failed to save sentence audio.',
      error,
    );
  }
}
