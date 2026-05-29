import {
  getRuntimeKind,
  invokeDesktop,
  isDesktopRuntime,
  isElectronRuntime,
} from './desktopRuntime';
import type { AudioAssetRef, CaptionTrack, DictionaryEntry } from './types';
import {
  fetchBingDictionaryHtmlInBrowser,
  lookupDictionaryEntry,
  type LookupDictionaryOptions,
} from './dictionaryProviders';

export interface RuntimeFileStatus {
  path: string;
  exists: boolean;
}

export interface RuntimeDiagnostics {
  debugBuild: boolean;
  appData: string;
  logsDir: string;
  bootstrapLog: string;
  bridgeLog: string;
  python: RuntimeFileStatus;
  uv: RuntimeFileStatus;
  ffmpeg: RuntimeFileStatus;
  ytDlp: RuntimeFileStatus;
  path: string;
}

export interface ClearRuntimeResult {
  deletedBytes: number;
  deletedPaths: string[];
}

export interface UserBackupResult {
  filePath?: string;
  exportedAt?: number;
  importedAt?: number;
  videoCount?: number;
  transcriptCount?: number;
  studyProgressCount?: number;
  sentenceNoteCount?: number;
  favoriteWordCount: number;
  favoriteSentenceCount: number;
  reviewProgressCount: number;
  reviewCardCount: number;
  reviewLogCount: number;
  audioCount: number;
  skippedCount?: number;
  cancelled?: boolean;
}

export interface UserDataClearResult {
  clearedAt: number;
  videoCount?: number;
  transcriptCount?: number;
  studyProgressCount?: number;
  sentenceNoteCount?: number;
  favoriteWordCount?: number;
  favoriteSentenceCount?: number;
  reviewProgressCount?: number;
  reviewCardCount?: number;
  reviewLogCount?: number;
  totalCount: number;
}

export interface PairingInfo {
  baseUrl: string;
  addresses: string[];
}

export interface LocalVideoImportResult {
  fingerprint: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  hasAudio?: boolean;
  audioCodec?: string;
  duration?: number;
  thumbnailUrl?: string;
  cancelled?: boolean;
}

export interface TranscriptJobStatus {
  status: 'queued' | 'running' | 'complete' | 'error' | 'cancelled';
  videoId: string;
  language: string;
  provider: string;
  fetchedAt: number;
  segments: CaptionTrack['segments'];
  error?: string;
}

export class PlatformBridgeError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PlatformBridgeError';
  }
}

export const platformBridge = {
  runtime: getRuntimeKind,
  isDesktop: isDesktopRuntime,
  isElectron: isElectronRuntime,
  invoke: invokeDesktop,
  settings: {
    openBootstrapLogs: () => invokeDesktop<void>('open_bootstrap_logs'),
    openBridgeLogs: () => invokeDesktop<void>('open_bridge_logs'),
    openRuntimeLogsDir: () => invokeDesktop<void>('open_runtime_logs_dir'),
    clearBootstrapRuntime: () => invokeDesktop<ClearRuntimeResult>('clear_bootstrap_runtime'),
    runtimeDiagnostics: () => invokeDesktop<RuntimeDiagnostics>('runtime_diagnostics'),
    exportUserBackup: () => invokeDesktop<UserBackupResult>('export_user_backup'),
    importUserBackup: () => invokeDesktop<UserBackupResult>('import_user_backup'),
    clearVideoData: () => invokeDesktop<UserDataClearResult>('clear_video_data'),
    clearLearningData: () => invokeDesktop<UserDataClearResult>('clear_learning_data'),
  },
  logs: {
    frontendEvent: (event: string, details: Record<string, unknown>) =>
      isDesktopRuntime()
        ? invokeDesktop<void>('log_frontend_event', { event, details }).catch(() => undefined)
        : Promise.resolve(),
  },
  sync: {
    async getPairingInfo(): Promise<PairingInfo> {
      if (isElectronRuntime()) {
        return invokeDesktop<PairingInfo>('get_pairing');
      }
      throw new PlatformBridgeError('Desktop client required.');
    },
    async restartPairingInfo(): Promise<PairingInfo> {
      if (isElectronRuntime()) {
        return invokeDesktop<PairingInfo>('restart_pairing');
      }
      throw new PlatformBridgeError('Desktop client required.');
    },
  },
  video: {
    async getYouTubeMetadata(videoId: string): Promise<{ title: string; thumbnailUrl?: string } | null> {
      try {
        const payload = await invokeDesktop<{ title?: unknown; thumbnailUrl?: unknown }>('get_video_meta', { videoId });
        if (typeof payload.title !== 'string') return null;
        return {
          title: payload.title,
          thumbnailUrl: typeof payload.thumbnailUrl === 'string' ? payload.thumbnailUrl : undefined,
        };
      } catch {
        return null;
      }
    },
    async selectLocal(): Promise<LocalVideoImportResult | null> {
      const payload = await invokeDesktop<unknown>('select_local_video_file');
      if (!payload || typeof payload !== 'object') {
        throw new PlatformBridgeError('Invalid video response.');
      }
      if ((payload as LocalVideoImportResult).cancelled) {
        return null;
      }
      if (typeof (payload as LocalVideoImportResult).fingerprint !== 'string') {
        throw new PlatformBridgeError('Missing video fingerprint.');
      }
      return payload as LocalVideoImportResult;
    },
    async localSourceUrl(fingerprint: string): Promise<string> {
      const payload = await invokeDesktop<unknown>('get_local_video_source', { fingerprint });
      if (!payload || typeof payload !== 'object' || typeof (payload as { path?: unknown }).path !== 'string') {
        throw new PlatformBridgeError('Invalid video response.');
      }
      if (typeof (payload as { url?: unknown }).url === 'string') {
        return (payload as { url: string }).url;
      }
      throw new PlatformBridgeError('Missing playable video URL.');
    },
    async ensureCompatibleAudio(fingerprint: string): Promise<{ audioCodec: string; transcoded: boolean }> {
      const payload = await invokeDesktop<unknown>('ensure_local_video_audio_compat', { fingerprint });
      if (!payload || typeof payload !== 'object') {
        throw new PlatformBridgeError('Invalid audio compat response.');
      }
      return payload as { audioCodec: string; transcoded: boolean };
    },
    async getAudioTranscodeProgress(fingerprint: string): Promise<{ active: boolean; progressSecs: number; totalSecs: number; remainingSecs: number }> {
      const payload = await invokeDesktop<unknown>('get_audio_transcode_progress', { fingerprint });
      if (!payload || typeof payload !== 'object') return { active: false, progressSecs: 0, totalSecs: 0, remainingSecs: 0 };
      return payload as { active: boolean; progressSecs: number; totalSecs: number; remainingSecs: number };
    },
    async deleteLocalAssets(fingerprint: string): Promise<void> {
      await invokeDesktop<unknown>('delete_local_video_assets', { fingerprint }).catch(() => undefined);
    },
    async setLocalCover(fingerprint: string, time: number): Promise<string> {
      const payload = await invokeDesktop<unknown>('set_local_video_cover', { fingerprint, time });
      if (!payload || typeof payload !== 'object' || typeof (payload as { thumbnailUrl?: unknown }).thumbnailUrl !== 'string') {
        throw new PlatformBridgeError('Invalid video response.');
      }
      return (payload as { thumbnailUrl: string }).thumbnailUrl;
    },
  },
  transcript: {
    get: (videoId: string, language?: string, forceRefresh?: boolean) =>
      invokeDesktop<CaptionTrack>('get_transcript', {
        videoId,
        language,
        forceRefresh: Boolean(forceRefresh),
      }),
    startYouTubeJob: (videoId: string, language = 'auto', forceRefresh = false) =>
      invokeDesktop<TranscriptJobStatus>('start_youtube_transcript_job', {
        videoId,
        language,
        forceRefresh,
      }),
    startLocalJob: (videoId: string, fingerprint: string, language = 'auto', forceRefresh = false) =>
      invokeDesktop<TranscriptJobStatus>('start_local_video_transcript_job', {
        videoId,
        fingerprint,
        language,
        forceRefresh,
      }),
    getJob: (id: string) => invokeDesktop<TranscriptJobStatus>('get_transcript_job', { id }),
    cancelJob: (id: string) => invokeDesktop<TranscriptJobStatus>('cancel_transcript_job', { id }),
  },
  audio: {
    async createSentenceClipAsset(options: {
      videoId: string;
      start: number;
      end: number;
      contentFingerprint?: string;
    }): Promise<{ playableUrl: string; audio: AudioAssetRef }> {
      const payload = await invokeDesktop<unknown>('create_sentence_audio_clip', {
        videoId: options.videoId,
        start: options.start,
        end: options.end,
        contentFingerprint: options.contentFingerprint,
      });
      if (!payload || typeof payload !== 'object' || typeof (payload as { playableUrl?: unknown }).playableUrl !== 'string') {
        throw new PlatformBridgeError('Invalid audio response.');
      }
      const audio = normalizeAudioAssetPayload((payload as { audio?: unknown }).audio);
      if (!audio) {
        throw new PlatformBridgeError('Missing audio asset.');
      }
      return {
        playableUrl: (payload as { playableUrl: string }).playableUrl,
        audio,
      };
    },
    async cacheRemoteAudioAsset(remoteUrl: string | undefined): Promise<AudioAssetRef | undefined> {
      if (!remoteUrl) return undefined;
      if (isElectronRuntime()) {
        const payload = await invokeDesktop<unknown>('cache_remote_audio_asset', { url: remoteUrl }).catch(() => null);
        const audio = normalizeAudioAssetPayload(payload && typeof payload === 'object' ? (payload as { audio?: unknown }).audio : payload);
        if (audio) return audio;
      }
      return { remoteUrl, status: 'available', updatedAt: Date.now() };
    },
    async resolveForPlayback(audio: AudioAssetRef | undefined): Promise<{
      playableUrl?: string;
      audio?: AudioAssetRef;
    }> {
      if (isElectronRuntime()) {
        const payload = await invokeDesktop<unknown>('resolve_audio_asset', { audio }).catch(() => null);
        if (payload && typeof payload === 'object') {
          const playableUrl = typeof (payload as { playableUrl?: unknown }).playableUrl === 'string'
            ? (payload as { playableUrl: string }).playableUrl
            : undefined;
          const resolvedAudio = normalizeAudioAssetPayload((payload as { audio?: unknown }).audio);
          if (playableUrl || resolvedAudio) {
            return { playableUrl, audio: resolvedAudio };
          }
        }
      }
      return { playableUrl: audio?.remoteUrl, audio };
    },
  },
  dictionary: {
    async lookup(normalizedWord: string, options?: LookupDictionaryOptions): Promise<DictionaryEntry | null> {
      const targetLanguage = options?.targetLanguage;
      void platformBridge.logs.frontendEvent('dictionary-lookup-start', {
        word: normalizedWord,
        targetLanguage,
        forceRefresh: Boolean(options?.forceRefresh),
        bingOnly: Boolean(options?.bingOnly),
      });
      const startedAt = Date.now();
      const entry = await lookupDictionaryEntry(normalizedWord, fetchBingDictionaryHtml, {
        ...options,
        logEvent: (event, details) => platformBridge.logs.frontendEvent(event, details),
      });
      const durationMs = Date.now() - startedAt;
      void platformBridge.logs.frontendEvent('dictionary-lookup-complete', {
        word: normalizedWord,
        targetLanguage,
        durationMs,
        found: Boolean(entry),
        result: entry ? summarizeDictionaryLookupResult(entry) : null,
      });
      void platformBridge.logs.frontendEvent('dictionary-lookup-result-line', {
        word: normalizedWord,
        targetLanguage,
        durationMs,
        found: Boolean(entry),
        line: formatDictionaryLookupResultLine(normalizedWord, targetLanguage, entry),
        result: entry ? summarizeDictionaryLookupResult(entry) : null,
      });
      return entry;
    },
  },
};

function normalizeAudioAssetPayload(value: unknown): AudioAssetRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as AudioAssetRef;
  return {
    ...(typeof payload.assetId === 'string' ? { assetId: payload.assetId } : {}),
    ...(typeof payload.remoteUrl === 'string' ? { remoteUrl: payload.remoteUrl } : {}),
    ...(typeof payload.mimeType === 'string' ? { mimeType: payload.mimeType } : {}),
    ...(payload.status === 'available' || payload.status === 'missing' ? { status: payload.status } : {}),
    ...(typeof payload.updatedAt === 'number' ? { updatedAt: payload.updatedAt } : {}),
  };
}


async function fetchBingDictionaryHtml(normalizedWord: string): Promise<string | null> {
  if (isElectronRuntime()) {
    return invokeDesktop<string | null>('fetch_bing_dictionary_html', { word: normalizedWord }).catch(() => null);
  }

  return fetchBingDictionaryHtmlInBrowser(normalizedWord);
}

function summarizeDictionaryLookupResult(entry: DictionaryEntry): Record<string, unknown> {
  return {
    source: entry.source,
    word: entry.word,
    phonetic: entry.phonetic,
    audio: entry.audio
      ? {
          hasAssetId: Boolean(entry.audio.assetId),
          hasRemoteUrl: Boolean(entry.audio.remoteUrl),
          status: entry.audio.status,
          mimeType: entry.audio.mimeType,
        }
      : null,
    meaningCount: entry.meanings.length,
    sectionCount: entry.sections?.length ?? 0,
    exampleCount: entry.examples?.length ?? 0,
    firstPartOfSpeech: entry.meanings[0]?.partOfSpeech,
    firstDefinition: entry.meanings[0]?.definitions[0],
    firstSectionTitle: entry.sections?.[0]?.title,
    firstSectionLabel: entry.sections?.[0]?.groups[0]?.label,
    firstSectionLine: entry.sections?.[0]?.groups[0]?.lines[0],
    meanings: entry.meanings,
    sections: entry.sections,
  };
}

function formatDictionaryLookupResultLine(
  queryWord: string,
  targetLanguage: string | undefined,
  entry: DictionaryEntry | null,
): string {
  if (!entry) {
    return [
      `query=${queryWord}`,
      `target=${targetLanguage ?? ''}`,
      'found=false',
    ].join(' | ');
  }

  const sectionText = (entry.sections ?? [])
    .map((section) => {
      const title = section.titleKey || section.title || 'translations';
      const groups = section.groups
        .map((group) => {
          const label = group.labelKey || group.label || '';
          const lines = group.lines.join(' / ');
          return [label, lines].filter(Boolean).join(': ');
        })
        .join(' || ');
      return [title, groups].filter(Boolean).join(' => ');
    })
    .join(' ### ');

  return [
    `query=${queryWord}`,
    `target=${targetLanguage ?? ''}`,
    'found=true',
    `source=${entry.source ?? ''}`,
    `word=${entry.word}`,
    `phonetic=${entry.phonetic ?? ''}`,
    `audio=${entry.audio?.assetId ? 'asset' : entry.audio?.remoteUrl ? 'remote' : 'none'}`,
    `meanings=${entry.meanings.length}`,
    `sections=${entry.sections?.length ?? 0}`,
    `examples=${entry.examples?.length ?? 0}`,
    `content=${sectionText}`,
  ].join(' | ');
}
