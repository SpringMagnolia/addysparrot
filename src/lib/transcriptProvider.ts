import { platformBridge, type TranscriptJobStatus } from './platformBridge';
import type { CaptionTrack } from './types';

export interface GetTranscriptOptions {
  language?: string;
  forceRefresh?: boolean;
}

export class TranscriptProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TranscriptProviderError';
  }
}

export async function getTranscript(
  videoIdOrUrl: string,
  options: GetTranscriptOptions = {},
): Promise<CaptionTrack> {
  try {
    const payload = await platformBridge.transcript.get(videoIdOrUrl, options.language, Boolean(options.forceRefresh));
    if (!isCaptionTrack(payload)) {
      throw new TranscriptProviderError('Invalid caption response.');
    }
    return payload;
  } catch (error) {
    if (error instanceof TranscriptProviderError) {
      throw error;
    }
    throw new TranscriptProviderError(getBridgeErrorMessage(error), error);
  }
}

export async function startLocalVideoTranscriptJob(options: {
  videoId: string;
  fingerprint: string;
  language?: string;
  forceRefresh?: boolean;
}): Promise<TranscriptJobStatus> {
  try {
    const payload = await platformBridge.transcript.startLocalJob(
      options.videoId,
      options.fingerprint,
      options.language ?? 'auto',
      Boolean(options.forceRefresh),
    );
    if (!isTranscriptJobStatus(payload)) {
      throw new TranscriptProviderError('Invalid transcription response.');
    }
    return payload;
  } catch (error) {
    if (error instanceof TranscriptProviderError) {
      throw error;
    }
    throw new TranscriptProviderError(getBridgeErrorMessage(error), error);
  }
}

export async function startYoutubeTranscriptJob(options: {
  videoId: string;
  language?: string;
  forceRefresh?: boolean;
}): Promise<TranscriptJobStatus> {
  try {
    const payload = await platformBridge.transcript.startYouTubeJob(
      options.videoId,
      options.language ?? 'auto',
      Boolean(options.forceRefresh),
    );
    if (!isTranscriptJobStatus(payload)) {
      throw new TranscriptProviderError('Invalid transcription response.');
    }
    return payload;
  } catch (error) {
    if (error instanceof TranscriptProviderError) {
      throw error;
    }
    throw new TranscriptProviderError(getBridgeErrorMessage(error), error);
  }
}

export async function getLocalVideoTranscriptJob(jobId: string): Promise<TranscriptJobStatus> {
  try {
    const payload = await platformBridge.transcript.getJob(jobId);
    if (!isTranscriptJobStatus(payload)) {
      throw new TranscriptProviderError('Invalid transcription response.');
    }
    return payload;
  } catch (error) {
    if (error instanceof TranscriptProviderError) {
      throw error;
    }
    throw new TranscriptProviderError(getBridgeErrorMessage(error), error);
  }
}

function getBridgeErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unknown error';
}

function isCaptionTrack(value: unknown): value is CaptionTrack {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as CaptionTrack;
  return (
    typeof candidate.videoId === 'string' &&
    typeof candidate.language === 'string' &&
    typeof candidate.provider === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    Array.isArray(candidate.segments) &&
    candidate.segments.every(
      (segment) =>
        typeof segment.id === 'string' &&
        typeof segment.text === 'string' &&
        typeof segment.start === 'number' &&
        typeof segment.duration === 'number' &&
        typeof segment.end === 'number' &&
        typeof segment.source === 'string' &&
        isCaptionWords((segment as { words?: unknown }).words) &&
        isCaptionLines(segment.lines),
    )
  );
}

function isTranscriptJobStatus(value: unknown): value is TranscriptJobStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as TranscriptJobStatus;
  return (
    ['queued', 'running', 'complete', 'error', 'cancelled'].includes(candidate.status) &&
    typeof candidate.videoId === 'string' &&
    typeof candidate.language === 'string' &&
    typeof candidate.provider === 'string' &&
    typeof candidate.fetchedAt === 'number' &&
    Array.isArray(candidate.segments)
  );
}

function isCaptionLines(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  return Array.isArray(value) && value.every(
    (line) =>
      line &&
      typeof line === 'object' &&
      typeof line.id === 'string' &&
      typeof line.text === 'string' &&
      typeof line.start === 'number' &&
      typeof line.duration === 'number' &&
      typeof line.end === 'number' &&
      typeof line.source === 'string' &&
      isCaptionWords((line as { words?: unknown }).words),
  );
}

function isCaptionWords(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  return Array.isArray(value) && value.every(
    (word) =>
      word &&
      typeof word === 'object' &&
      typeof (word as { id?: unknown }).id === 'string' &&
      typeof (word as { text?: unknown }).text === 'string' &&
      typeof (word as { start?: unknown }).start === 'number' &&
      typeof (word as { duration?: unknown }).duration === 'number' &&
      typeof (word as { end?: unknown }).end === 'number',
  );
}
