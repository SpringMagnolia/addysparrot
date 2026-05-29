import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  Edit3,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Scissors,
  Search,
  Square,
  Trash2,
  Underline,
  Video,
  Volume2,
  Languages,
} from 'lucide-react';
import { LocalVideoPlayer } from '../components/LocalVideoPlayer';
import { YouTubePlayer, type YouTubePlayerHandle } from '../components/YouTubePlayer';
import { TimedLineText } from '../components/TimedLineText';
import { DictionaryEntryContent } from '../components/DictionaryEntry';
import { AudioTextButton, playAudio, isPlayableAudio } from '../components/AudioTextButton';
import { useI18n } from '../lib/i18n/context';
import { navigate } from '../lib/router';
import { platformBridge } from '../lib/platformBridge';
import { lookupWord, normalizeLookupWord } from '../lib/dictionary';
import { createId } from '../lib/id';
import { createSentenceAudioAsset } from '../lib/sentenceAudio';
import {
  deleteFavoriteSentence,
  deleteSentenceNote,
  getAppSetting,
  getCachedTranscript,
  getSentenceNote,
  getStudyProgress,
  getVideo,
  listFavoriteWords,
  listFavoriteSentences,
  saveFavoriteSentence,
  saveFavoriteWord,
  saveAppSetting,
  saveSentenceNote,
  saveStudyProgress,
  saveTranscript,
  saveVideo,
  syncFavoriteNotesForSegment,
} from '../lib/storage';
import {
  getLocalVideoTranscriptJob,
  startLocalVideoTranscriptJob,
  startYoutubeTranscriptJob,
} from '../lib/transcriptProvider';
import { formatRange } from '../lib/time';
import type {
  CaptionSegment,
  CaptionLine,
  CaptionTrack,
  DictionaryEntry,
  FavoriteWord,
  SentenceNote,
  SavedVideo,
  StudyProgress,
} from '../lib/types';
import { createThumbnailUrl, createYouTubeWatchUrl } from '../lib/youtube';
import {
  getSegmentDisplayLine,
  getTimedWordsForLine,
  isEditedCaptionSource,
  canSplitSegmentIntoTimedSegments,
  createSplitSegmentsForSegment,
  mergeGeneratedTrackWithEditedTrack,
  isUsableCachedTrack,
  createTrackFromJobStatus,
  resolveInitialSegment,
  findSegmentAtTime,
  mergeCaptionSegments,
  roundTime,
} from '../lib/captionUtils';
import {
  formatDictionaryDefinition,
  formatPhonetic,
  formatTranscodeRemaining,
} from '../lib/formatUtils';
import {
  createFavoriteWordKey,
  sentenceContainsWord,
  transcriptJobPersistenceKey,
} from '../lib/reviewUtils';
import {
  createWordNoteMap,
  cacheDictionaryEntryAudioForFavorite,
  isTypingTarget,
  pickLongerText,
  pickDictionaryEntry,
  pickAudioAssetRef,
} from '../lib/favoriteUtils';
import {
  getLocalAudioWarning,
  isLikelyBrowserAudioCodec,
  sleep,
  fetchVideoMetadata,
  loadDictionaryTargetLanguageSetting,
  WORD_UNDERLINE_SETTING_ID,
} from '../lib/videoUtils';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25];
const MOBILE_SHEET_PEEK_SNAP_INDEX = 1;
const MOBILE_SHEET_SENTENCE_SNAP_INDEX = 2;
const MOBILE_SHEET_EXPANDED_SNAP_INDEX = 3;
const MOBILE_SHEET_SNAP_POINTS = [0, 86, 320, 1];

type MobileSheetLevel = 'peek' | 'sentence' | 'expanded';

function mobileSheetLevelToSnapIndex(level: MobileSheetLevel): number {
  if (level === 'peek') return MOBILE_SHEET_PEEK_SNAP_INDEX;
  if (level === 'expanded') return MOBILE_SHEET_EXPANDED_SNAP_INDEX;
  return MOBILE_SHEET_SENTENCE_SNAP_INDEX;
}

function snapIndexToMobileSheetLevel(snapIndex: number): MobileSheetLevel {
  if (snapIndex <= MOBILE_SHEET_PEEK_SNAP_INDEX) return 'peek';
  if (snapIndex >= MOBILE_SHEET_EXPANDED_SNAP_INDEX) return 'expanded';
  return 'sentence';
}

export function DetailPage({ id }: { id: string }) {
  const { t } = useI18n();
  const [video, setVideo] = useState<SavedVideo | null>(null);
  const [localVideoSourceUrl, setLocalVideoSourceUrl] = useState<string | null>(null);
  const [localVideoSourceLoading, setLocalVideoSourceLoading] = useState(false);
  const [track, setTrack] = useState<CaptionTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [segmentPlaybackRates, setSegmentPlaybackRates] = useState<Record<string, number>>({});
  const [hasStartedPractice, setHasStartedPractice] = useState(false);
  const [captionMenuOpen, setCaptionMenuOpen] = useState(false);
  const [favoriteSentenceIds, setFavoriteSentenceIds] = useState<Set<string>>(new Set());
  const [favoriteWordKeys, setFavoriteWordKeys] = useState<Set<string>>(new Set());
  const [playedSegmentIds, setPlayedSegmentIds] = useState<Set<string>>(new Set());
  const [lastStudySegmentId, setLastStudySegmentId] = useState<string | null>(null);
  const [practiceRange, setPracticeRange] = useState<CaptionSegment | CaptionLine | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [segmentSelectionMode, setSegmentSelectionMode] = useState(false);
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [wordNotesByWord, setWordNotesByWord] = useState<Map<string, string>>(new Map());
  const [editingWordNote, setEditingWordNote] = useState(false);
  const [wordNoteText, setWordNoteText] = useState('');
  const [savingWordNote, setSavingWordNote] = useState(false);
  const [audioTranscodeRemaining, setAudioTranscodeRemaining] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isRecordingPlaying, setIsRecordingPlaying] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editedSentenceText, setEditedSentenceText] = useState('');
  const [sentenceNoteText, setSentenceNoteText] = useState('');
  const [savedSentenceNoteText, setSavedSentenceNoteText] = useState('');
  const [savingSentenceNote, setSavingSentenceNote] = useState(false);
  const [editingSentenceNote, setEditingSentenceNote] = useState(false);
  const [wordUnderlineEnabled, setWordUnderlineEnabled] = useState(false);
  const [mobileSheetLevel, setMobileSheetLevel] = useState<MobileSheetLevel>('peek');
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  const [selectedWord, setSelectedWord] = useState<{
    word: string;
    sentence: CaptionSegment | null;
    entry: DictionaryEntry | null;
    loading: boolean;
  } | null>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const videoRef = useRef<SavedVideo | null>(null);
  const trackRef = useRef<CaptionTrack | null>(null);
  const segmentListRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef<Record<string, HTMLElement | null>>({});
  const seekAfterReloadRef = useRef<number | null>(null);
  const transcriptRunRef = useRef(0);
  const transcriptEditedRef = useRef(false);
  const lastPersistedTranscriptJobKeyRef = useRef<string | null>(null);
  const segmentSelectionAnchorRef = useRef<string | null>(null);
  const playedSegmentIdsRef = useRef<Set<string>>(new Set());
  const lastPersistedSegmentIdRef = useRef<string | null>(null);
  const suppressPlaybackSyncUntilPracticeRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const shouldPlayRecordingAfterStopRef = useRef(true);
  const mobileSheetRef = useRef<SheetRef | null>(null);
  const activeSegmentIdRef = useRef<string | null>(null);
  const activeSegmentScrollFrameRef = useRef(0);
  const windowResizingRef = useRef(false);
  const windowResizeQuietTimerRef = useRef<number | null>(null);
  const getCurrentPlaybackTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);

  const persistVideoPatch = useCallback(
    async (patch: Partial<SavedVideo>) => {
      const current = (await getVideo(id)) ?? videoRef.current;
      if (!current) return;
      const updated = { ...current, ...patch };
      await saveVideo(updated);
      setVideo((previous) => (previous?.id === updated.id ? { ...previous, ...patch } : previous));
    },
    [id],
  );

  const persistTranscriptJob = useCallback(
    async (job: NonNullable<SavedVideo['transcriptJob']>) => {
      const key = transcriptJobPersistenceKey(job);
      if (lastPersistedTranscriptJobKeyRef.current === key) return;
      lastPersistedTranscriptJobKeyRef.current = key;
      await persistVideoPatch({ transcriptJob: job });
    },
    [persistVideoPatch],
  );

  const activeSegmentIndex = useMemo(
    () => (track && activeSegmentId ? track.segments.findIndex((segment) => segment.id === activeSegmentId) : -1),
    [activeSegmentId, track],
  );
  const currentSegment =
    track && activeSegmentIndex >= 0 ? track.segments[activeSegmentIndex] : track?.segments[0] ?? null;
  const currentSegmentLine = currentSegment ? getSegmentDisplayLine(currentSegment) : null;
  const currentSegmentHasTimedWords = currentSegment
    ? Boolean(currentSegmentLine && getTimedWordsForLine(currentSegmentLine, currentSegment).length > 0)
    : false;
  const currentSegmentIsEdited = currentSegment ? isEditedCaptionSource(currentSegment) : false;
  const showWordUnderlineToggle = Boolean(
    currentSegment &&
      track?.provider.toLowerCase().includes('whisperx') &&
      (currentSegmentHasTimedWords || currentSegmentIsEdited),
  );
  const currentSegmentCanSplit = currentSegment ? canSplitSegmentIntoTimedSegments(currentSegment) : false;
  const isEditingCurrentSegment = Boolean(currentSegment && editingSegmentId === currentSegment.id);
  const currentPracticeRange = practiceRange ?? currentSegment;
  const currentSentenceSaved = currentSegment ? favoriteSentenceIds.has(currentSegment.id) : false;
  const visibleSegments = useMemo(
    () =>
      track
        ? showFavoriteOnly
          ? track.segments.filter((segment) => favoriteSentenceIds.has(segment.id))
          : track.segments
        : [],
    [favoriteSentenceIds, showFavoriteOnly, track],
  );
  const selectedSegmentIndexes = useMemo(
    () =>
      track
        ? track.segments
            .map((segment, index) => (selectedSegmentIds.has(segment.id) ? index : -1))
            .filter((index) => index >= 0)
        : [],
    [selectedSegmentIds, track],
  );
  const selectedSegmentsAreContiguous =
    selectedSegmentIndexes.length >= 2 &&
    selectedSegmentIndexes.length ===
      Math.max(...selectedSegmentIndexes) - Math.min(...selectedSegmentIndexes) + 1;
  const selectedWordExampleSentence = selectedWord?.sentence;
  const selectedWordSaved = selectedWord
    ? favoriteWordKeys.has(createFavoriteWordKey(selectedWord.word, selectedWordExampleSentence?.text))
    : false;
  const selectedWordKey = selectedWord ? normalizeLookupWord(selectedWord.word) : '';
  const selectedWordNote = selectedWordKey ? wordNotesByWord.get(selectedWordKey) ?? '' : '';
  const hasSelectedWordNote = selectedWordNote.trim().length > 0;
  const wordNoteChanged = wordNoteText !== selectedWordNote;
  const currentSavedSentenceNote = savedSentenceNoteText.trim();
  const sentenceNoteChanged = sentenceNoteText !== savedSentenceNoteText;
  const hasSavedSentenceNote = savedSentenceNoteText.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    getAppSetting<boolean>(WORD_UNDERLINE_SETTING_ID).then((enabled) => {
      if (!cancelled && typeof enabled === 'boolean') {
        setWordUnderlineEnabled(enabled);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function stopRecordingPlayback() {
    const audio = recordingAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      recordingAudioRef.current = null;
    }
    setIsRecordingPlaying(false);
  }

  function replaceRecordingUrl(nextUrl: string | null) {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
    }
    recordingUrlRef.current = nextUrl;
    setRecordingUrl(nextUrl);
  }

  function clearRecording() {
    stopRecordingPlayback();
    replaceRecordingUrl(null);
    setRecordingError(null);
  }

  function playRecording(nextUrl = recordingUrlRef.current) {
    if (!nextUrl) return;

    stopRecordingPlayback();
    const audio = new Audio(nextUrl);
    audio.loop = true;
    audio.addEventListener('pause', () => setIsRecordingPlaying(false));
    audio.addEventListener('play', () => setIsRecordingPlaying(true));
    recordingAudioRef.current = audio;
    void audio.play().catch(() => {
      setIsRecordingPlaying(false);
      setRecordingError('Playback was blocked. Tap play again.');
    });
  }

  function stopVideoPracticeForRecording() {
    playerRef.current?.pause();
    setHasStartedPractice(false);
  }

  function stopRecordingForVideoPlayback() {
    stopRecordingPlayback();
    if (mediaRecorderRef.current?.state === 'recording') {
      shouldPlayRecordingAfterStopRef.current = false;
      mediaRecorderRef.current.stop();
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Recording is not supported.');
      return;
    }

    try {
      stopVideoPracticeForRecording();
      stopRecordingPlayback();
      replaceRecordingUrl(null);
      setRecordingError(null);
      shouldPlayRecordingAfterStopRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const chunks = recordingChunksRef.current;
        const recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const shouldPlay = shouldPlayRecordingAfterStopRef.current;
        shouldPlayRecordingAfterStopRef.current = true;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopRecordingStream();
        setIsRecording(false);

        if (!recording.size) {
          setRecordingError(t('recordingEmpty'));
          return;
        }

        const nextUrl = URL.createObjectURL(recording);
        replaceRecordingUrl(nextUrl);
        if (shouldPlay) {
          playRecording(nextUrl);
        }
      });

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      stopRecordingStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingError(error instanceof Error ? error.message : 'Recording failed.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      shouldPlayRecordingAfterStopRef.current = true;
      mediaRecorderRef.current.stop();
      return;
    }

    setIsRecording(false);
    stopRecordingStream();
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  function toggleRecordingPlayback() {
    if (isRecordingPlaying) {
      stopRecordingPlayback();
      return;
    }

    playRecording();
  }

  const refreshFavorites = useCallback(async () => {
    const [words, sentences] = await Promise.all([listFavoriteWords(), listFavoriteSentences()]);
    setFavoriteSentenceIds(
      new Set(sentences.filter((sentence) => sentence.videoId === id).map((sentence) => sentence.segmentId)),
    );
    setFavoriteWordKeys(
      new Set(
        words.map((word) => createFavoriteWordKey(word.word, word.sentence)),
      ),
    );
    setWordNotesByWord(createWordNoteMap(words));
  }, [id]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)');
    const updateMobileViewport = () => setIsMobileViewport(query.matches);
    updateMobileViewport();
    query.addEventListener('change', updateMobileViewport);
    return () => query.removeEventListener('change', updateMobileViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    mobileSheetRef.current?.snapTo(mobileSheetLevelToSnapIndex(mobileSheetLevel));
  }, [isMobileViewport, mobileSheetLevel]);

  useEffect(() => {
    clearRecording();
  }, [currentSegment?.id]);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    videoRef.current = video;
  }, [video]);

  useEffect(() => {
    let cancelled = false;
    setLocalVideoSourceUrl(null);
    if (!video || video.sourceType !== 'local' || !video.contentFingerprint) {
      setLocalVideoSourceLoading(false);
      return;
    }

    const fingerprint = video.contentFingerprint;
    const needsAudioFix =
      video.hasAudio !== false &&
      Boolean(video.audioCodec) &&
      !isLikelyBrowserAudioCodec(video.audioCodec!);

    // 1. Get URL immediately — video appears without waiting for transcoding.
    setLocalVideoSourceLoading(true);
    platformBridge.video.localSourceUrl(fingerprint)
      .then((url) => {
        if (!cancelled) setLocalVideoSourceUrl(url);
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Local video unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLocalVideoSourceLoading(false);
      });

    // 2. If audio is incompatible, transcode in background while video plays.
    if (needsAudioFix) {
      // Poll progress every second while transcoding is active.
      const pollTimer = window.setInterval(async () => {
        try {
          const prog = await platformBridge.video.getAudioTranscodeProgress(fingerprint);
          if (!cancelled) {
            setAudioTranscodeRemaining(prog.active ? Math.ceil(prog.remainingSecs) : null);
          }
        } catch {
          // ignore poll errors
        }
      }, 1000);

      platformBridge.video.ensureCompatibleAudio(fingerprint)
        .then(async ({ audioCodec, transcoded }) => {
          window.clearInterval(pollTimer);
          if (cancelled) return;
          setAudioTranscodeRemaining(null);
          if (!transcoded) return;
          seekAfterReloadRef.current = playerRef.current?.getCurrentTime() ?? 0;
          setLocalVideoSourceUrl(`addysparrot-video://video/${fingerprint}?v=${Date.now()}`);
          const current = (await getVideo(id)) ?? video;
          if (!cancelled) {
            const updated = { ...current, audioCodec };
            await saveVideo(updated);
            setVideo(updated);
          }
        })
        .catch(() => {
          window.clearInterval(pollTimer);
          if (!cancelled) setAudioTranscodeRemaining(null);
        });

      return () => {
        cancelled = true;
        window.clearInterval(pollTimer);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [video?.contentFingerprint, video?.sourceType]);

  useEffect(() => {
    setWordNoteText(selectedWordNote);
    setEditingWordNote(false);
  }, [selectedWordKey, selectedWordNote]);

  useEffect(() => {
    if (editingSegmentId && currentSegment?.id !== editingSegmentId) {
      setEditingSegmentId(null);
      setEditedSentenceText('');
    }
  }, [currentSegment?.id, editingSegmentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentSentenceNote() {
      if (!currentSegment) {
        setSentenceNoteText('');
        setSavedSentenceNoteText('');
        return;
      }

      const note = await getSentenceNote(id, currentSegment.id);
      if (cancelled) return;

      const text = note?.text ?? '';
      setSentenceNoteText(text);
      setSavedSentenceNoteText(text);
      setEditingSentenceNote(false);
    }

    loadCurrentSentenceNote();
    return () => {
      cancelled = true;
    };
  }, [currentSegment?.id, id]);

  useEffect(
    () => () => {
      shouldPlayRecordingAfterStopRef.current = false;
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopRecordingStream();
      const audio = recordingAudioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
    },
    [],
  );

  const loadTranscript = useCallback(
    async (forceRefresh = false) => {
      const runId = transcriptRunRef.current + 1;
      transcriptRunRef.current = runId;
      transcriptEditedRef.current = false;
      setLoading(true);
      setError(null);
      setTranscriptionStatus(null);
      void persistTranscriptJob({
        status: 'running',
        stage: 'transcription',
        segmentCount: trackRef.current?.segments.length ?? 0,
        updatedAt: Date.now(),
      });

      try {
        let storedVideo = await getVideo(id);
        if (forceRefresh) {
          const resetProgress: StudyProgress = {
            videoId: id,
            lastSegmentId: null,
            playedSegmentIds: [],
            updatedAt: Date.now(),
          };
          playedSegmentIdsRef.current = new Set();
          lastPersistedSegmentIdRef.current = null;
          suppressPlaybackSyncUntilPracticeRef.current = false;
          setPlayedSegmentIds(new Set());
          setLastStudySegmentId(null);
          await saveStudyProgress(resetProgress);
        }

        const progress = forceRefresh ? undefined : await getStudyProgress(id);
        if (progress) {
          const nextPlayedIds = new Set(progress.playedSegmentIds);
          playedSegmentIdsRef.current = nextPlayedIds;
          lastPersistedSegmentIdRef.current = progress.lastSegmentId;
          suppressPlaybackSyncUntilPracticeRef.current = Boolean(progress.lastSegmentId);
          setPlayedSegmentIds(nextPlayedIds);
          setLastStudySegmentId(progress.lastSegmentId);
        } else {
          playedSegmentIdsRef.current = new Set();
          lastPersistedSegmentIdRef.current = null;
          suppressPlaybackSyncUntilPracticeRef.current = false;
          setPlayedSegmentIds(new Set());
          setLastStudySegmentId(null);
        }

        const restoredSegmentId = progress?.lastSegmentId ?? null;
        let initializedActiveSegment = false;
        const applyTrack = (nextTrack: CaptionTrack) => {
          const trackToApply = transcriptEditedRef.current
            ? mergeGeneratedTrackWithEditedTrack(trackRef.current, nextTrack)
            : nextTrack;
          trackRef.current = trackToApply;
          setTrack(trackToApply);
          if (initializedActiveSegment) {
            return trackToApply;
          }

          const initialSegment = resolveInitialSegment(trackToApply.segments, restoredSegmentId);
          if (restoredSegmentId && initialSegment.reason === 'missing-preferred') {
            void platformBridge.logs.frontendEvent('study-progress-missing-segment', {
              videoId: id,
              missingSegmentId: restoredSegmentId,
              fallbackSegmentId: initialSegment.segmentId,
              segmentCount: trackToApply.segments.length,
              reason: 'saved lastSegmentId is not present in the persisted transcript',
            });
          }
          const initialSegmentId = initialSegment.segmentId;
          lastPersistedSegmentIdRef.current = initialSegmentId;
          setLastStudySegmentId(initialSegmentId);
          setActiveSegmentId(initialSegmentId);
          setSelectedSegmentIds(new Set());
          segmentSelectionAnchorRef.current = initialSegmentId;
          initializedActiveSegment = true;
          return trackToApply;
        };

        const cached = !forceRefresh ? await getCachedTranscript(id) : undefined;
        if (cached && isUsableCachedTrack(cached)) {
          applyTrack(cached);
          void persistTranscriptJob({
            status: 'complete',
            stage: 'complete',
            segmentCount: cached.segments.length,
            updatedAt: Date.now(),
          });
          return;
        }

        if (storedVideo?.sourceType === 'local') {
          if (!storedVideo?.contentFingerprint) {
            throw new Error('Missing local video fingerprint.');
          }

          const localVideoLanguage = 'en';
          setTranscriptionStatus(t('transcriptLocalStarting'));
          void persistTranscriptJob({
            status: 'queued',
            stage: 'audio_extract',
            segmentCount: 0,
            updatedAt: Date.now(),
          });
          let job = await startLocalVideoTranscriptJob({
            videoId: id,
            fingerprint: storedVideo.contentFingerprint,
            language: localVideoLanguage,
            forceRefresh,
          });

          while (transcriptRunRef.current === runId) {
            const partialTrack = createTrackFromJobStatus(job);
            let displayedTrack = partialTrack;
            if (partialTrack.segments.length > 0) {
              displayedTrack = applyTrack(partialTrack);
              setLoading(false);
              setTranscriptionStatus(
                job.status === 'complete'
                  ? null
                  : t('transcriptProgress', { count: partialTrack.segments.length }),
              );
              void persistTranscriptJob({
                status: job.status === 'complete' ? 'complete' : 'running',
                stage: job.status === 'complete' ? 'complete' : 'transcription',
                segmentCount: partialTrack.segments.length,
                updatedAt: Date.now(),
              });
            } else {
              setTranscriptionStatus(t('transcriptFirstBatch'));
              void persistTranscriptJob({
                status: job.status === 'queued' ? 'queued' : 'running',
                stage: 'audio_extract',
                segmentCount: 0,
                updatedAt: Date.now(),
              });
            }

            if (job.status === 'complete') {
              await saveTranscript(displayedTrack);
              setLoading(false);
              setTranscriptionStatus(null);
              return;
            }

            if (job.status === 'error') {
              void persistTranscriptJob({
                status: 'error',
                stage: 'error',
                segmentCount: partialTrack.segments.length,
                updatedAt: Date.now(),
                error: job.error ?? 'Transcription failed.',
              });
              throw new Error(job.error ?? 'Transcription failed.');
            }

            if (job.status === 'cancelled') {
              setLoading(false);
              setTranscriptionStatus(null);
              void persistTranscriptJob({
                status: 'cancelled',
                stage: 'cancelled',
                segmentCount: partialTrack.segments.length,
                updatedAt: Date.now(),
              });
              return;
            }

            await sleep(1800);
            job = await getLocalVideoTranscriptJob(`${id}:${localVideoLanguage}`);
          }
          return;
        }

        const youtubeVideoLanguage = 'en';
        setTranscriptionStatus(t('transcriptYouTubeStarting'));
        void persistTranscriptJob({
          status: 'queued',
          stage: 'audio_download',
          segmentCount: 0,
          updatedAt: Date.now(),
        });
        let job = await startYoutubeTranscriptJob({
          videoId: id,
          language: youtubeVideoLanguage,
          forceRefresh,
        });

        while (transcriptRunRef.current === runId) {
          const partialTrack = createTrackFromJobStatus(job);
          let displayedTrack = partialTrack;
          if (partialTrack.segments.length > 0) {
            displayedTrack = applyTrack({ ...partialTrack, videoId: id });
            setLoading(false);
            setTranscriptionStatus(
              job.status === 'complete'
                ? null
                : t('transcriptProgress', { count: partialTrack.segments.length }),
            );
            void persistTranscriptJob({
              status: job.status === 'complete' ? 'complete' : 'running',
              stage: job.status === 'complete' ? 'complete' : 'transcription',
              segmentCount: partialTrack.segments.length,
              updatedAt: Date.now(),
            });
          } else {
            setTranscriptionStatus(t('transcriptYouTubeFirstBatch'));
            void persistTranscriptJob({
              status: job.status === 'queued' ? 'queued' : 'running',
              stage: 'audio_download',
              segmentCount: 0,
              updatedAt: Date.now(),
            });
          }

          if (job.status === 'complete') {
            const normalized = { ...displayedTrack, videoId: id };
            await saveTranscript(normalized);
            setLoading(false);
            setTranscriptionStatus(null);
            return;
          }

          if (job.status === 'error') {
            void persistTranscriptJob({
              status: 'error',
              stage: 'error',
              segmentCount: partialTrack.segments.length,
              updatedAt: Date.now(),
              error: job.error ?? 'Transcription failed.',
            });
            throw new Error(job.error ?? 'Transcription failed.');
          }

          if (job.status === 'cancelled') {
            setLoading(false);
            setTranscriptionStatus(null);
            void persistTranscriptJob({
              status: 'cancelled',
              stage: 'cancelled',
              segmentCount: partialTrack.segments.length,
              updatedAt: Date.now(),
            });
            return;
          }

          await sleep(1800);
          job = await getLocalVideoTranscriptJob(`${id}:${youtubeVideoLanguage}`);
        }
        return;
      } catch (err) {
        setTrack(null);
        setActiveSegmentId(null);
        setError(err instanceof Error ? err.message : 'Caption generation failed.');
        void persistTranscriptJob({
          status: 'error',
          stage: 'error',
          segmentCount: 0,
          updatedAt: Date.now(),
          error: err instanceof Error ? err.message : 'Caption generation failed.',
        });
        setTranscriptionStatus(null);
      } finally {
        if (transcriptRunRef.current === runId) {
          setLoading(false);
        }
      }
    },
    [id, persistTranscriptJob, t],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = await getVideo(id);
      if (!cancelled) {
        const nextVideo =
          stored ?? {
            id,
            videoId: id,
            url: createYouTubeWatchUrl(id),
            title: `YouTube Video ${id}`,
            thumbnailUrl: createThumbnailUrl(id),
            createdAt: Date.now(),
            sourceType: 'youtube' as const,
            updatedAt: Date.now(),
          };
        setVideo(nextVideo);
        if (
          nextVideo.sourceType !== 'local' &&
          (nextVideo.title === id || nextVideo.title.startsWith('YouTube Video '))
        ) {
          const metadata = await fetchVideoMetadata(id);
          if (!cancelled && metadata?.title) {
            const updatedVideo = {
              ...nextVideo,
              title: metadata.title,
              thumbnailUrl: metadata.thumbnailUrl ?? nextVideo.thumbnailUrl,
            };
            await saveVideo(updatedVideo);
            setVideo(updatedVideo);
          }
        }
      }
    }

    hydrate();
    loadTranscript();
    refreshFavorites();

    return () => {
      cancelled = true;
    };
  }, [id, loadTranscript, refreshFavorites]);

  useEffect(() => {
    if (isRecording || isRecordingPlaying) {
      return;
    }

    const range = currentPracticeRange;
    if (!range) {
      return;
    }

    const interval = window.setInterval(() => {
      const current = playerRef.current?.getCurrentTime() ?? 0;
      if (!hasStartedPractice && current >= range.start && current < range.end) {
        suppressPlaybackSyncUntilPracticeRef.current = false;
        setHasStartedPractice(true);
        return;
      }

      if (current >= range.end || current < range.start - 0.3) {
        if (!hasStartedPractice) return;
        playerRef.current?.playSegment(range.start, playbackRate, range.end);
      }
    }, 350);

    return () => window.clearInterval(interval);
  }, [currentPracticeRange, hasStartedPractice, isRecording, isRecordingPlaying, playbackRate]);

  useEffect(() => {
    activeSegmentIdRef.current = activeSegmentId;
  }, [activeSegmentId]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(activeSegmentScrollFrameRef.current);
      if (windowResizeQuietTimerRef.current !== null) {
        window.clearTimeout(windowResizeQuietTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const onWindowResize = () => {
      windowResizingRef.current = true;
      if (windowResizeQuietTimerRef.current !== null) {
        window.clearTimeout(windowResizeQuietTimerRef.current);
      }
      windowResizeQuietTimerRef.current = window.setTimeout(() => {
        windowResizingRef.current = false;
        windowResizeQuietTimerRef.current = null;
        scrollActiveSegmentIntoView('auto', { onlyIfOutside: true });
      }, 180);
    };

    window.addEventListener('resize', onWindowResize);
    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (windowResizeQuietTimerRef.current !== null) {
        window.clearTimeout(windowResizeQuietTimerRef.current);
        windowResizeQuietTimerRef.current = null;
      }
      windowResizingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSegmentId) {
      return;
    }

    scrollActiveSegmentIntoView('auto', { onlyIfOutside: true });
  }, [activeSegmentId]);

  useEffect(() => {
    scrollActiveSegmentIntoView('auto', { onlyIfOutside: false });
  }, [showFavoriteOnly, visibleSegments.length]);

  useEffect(() => {
    const list = segmentListRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (windowResizingRef.current) {
        return;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => scrollActiveSegmentIntoView('auto', { onlyIfOutside: true }));
    });
    observer.observe(list);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeSegmentId, showFavoriteOnly]);

  function scrollActiveSegmentIntoView(
    behavior: ScrollBehavior = 'auto',
    options: { onlyIfOutside?: boolean } = {},
  ) {
    const segmentId = activeSegmentIdRef.current ?? activeSegmentId;
    if (!segmentId) return;

    window.cancelAnimationFrame(activeSegmentScrollFrameRef.current);
    activeSegmentScrollFrameRef.current = window.requestAnimationFrame(() => {
      const list = segmentListRef.current;
      const segment = segmentRefs.current[segmentId];
      if (!list || !segment) return;

      if (options.onlyIfOutside) {
        const listRect = list.getBoundingClientRect();
        const segmentRect = segment.getBoundingClientRect();
        const verticalPadding = Math.min(96, listRect.height * 0.28);
        const isComfortablyVisible =
          segmentRect.top >= listRect.top + verticalPadding &&
          segmentRect.bottom <= listRect.bottom - verticalPadding;
        if (isComfortablyVisible) {
          return;
        }
      }

      segment.scrollIntoView({
        behavior,
        block: 'center',
      });
    });
  }

  async function persistStudyProgressSnapshot(lastSegmentId: string | null, playedIds: Set<string>) {
    const nextPlayedIds = new Set(playedIds);
    playedSegmentIdsRef.current = nextPlayedIds;
    lastPersistedSegmentIdRef.current = lastSegmentId;
    const progress: StudyProgress = {
      videoId: id,
      lastSegmentId,
      playedSegmentIds: Array.from(nextPlayedIds),
      updatedAt: Date.now(),
    };

    setPlayedSegmentIds(nextPlayedIds);
    setLastStudySegmentId(lastSegmentId);
    await saveStudyProgress(progress);
  }

  async function persistStudyProgress(segment: CaptionSegment) {
    const nextPlayedIds = new Set(playedSegmentIdsRef.current);
    nextPlayedIds.add(segment.id);
    await persistStudyProgressSnapshot(segment.id, nextPlayedIds);
  }

  useEffect(() => {
    if (!track || track.segments.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const currentTime = playerRef.current?.getCurrentTime() ?? 0;
      if (suppressPlaybackSyncUntilPracticeRef.current && !hasStartedPractice) {
        return;
      }

      if (
        hasStartedPractice &&
        practiceRange &&
        (currentTime < practiceRange.start - 0.3 || currentTime >= practiceRange.end - 0.04)
      ) {
        return;
      }

      const segment = findSegmentAtTime(track.segments, currentTime);
      if (!segment || segment.id === activeSegmentId) {
        return;
      }

      const rate = segmentPlaybackRates[segment.id] ?? 1;
      setActiveSegmentId(segment.id);
      setPlaybackRate(rate);
      playerRef.current?.setPlaybackRate(rate);
      if (lastPersistedSegmentIdRef.current !== segment.id) {
        void persistStudyProgress(segment);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeSegmentId, hasStartedPractice, practiceRange, segmentPlaybackRates, track]);

  async function toggleWordUnderline() {
    const nextEnabled = !wordUnderlineEnabled;
    setWordUnderlineEnabled(nextEnabled);
    await saveAppSetting(WORD_UNDERLINE_SETTING_ID, nextEnabled);
  }

  function playSegment(segment: CaptionSegment) {
    stopRecordingForVideoPlayback();
    const rate = segmentPlaybackRates[segment.id] ?? 1;
    suppressPlaybackSyncUntilPracticeRef.current = false;
    segmentSelectionAnchorRef.current = segment.id;
    setSelectedSegmentIds(new Set());
    setActiveSegmentId(segment.id);
    setPlaybackRate(rate);
    setPracticeRange(segment);
    setHasStartedPractice(true);
    playerRef.current?.playSegment(segment.start, rate, segment.end);
    void persistStudyProgress(segment);
  }

  function selectSegmentRange(segmentId: string) {
    if (!track) return;

    const anchorId = segmentSelectionAnchorRef.current ?? activeSegmentId ?? segmentId;
    const anchorIndex = track.segments.findIndex((segment) => segment.id === anchorId);
    const targetIndex = track.segments.findIndex((segment) => segment.id === segmentId);
    if (targetIndex < 0) return;

    if (anchorIndex < 0) {
      segmentSelectionAnchorRef.current = segmentId;
      setSelectedSegmentIds(new Set([segmentId]));
      return;
    }

    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    setSelectedSegmentIds(new Set(track.segments.slice(startIndex, endIndex + 1).map((segment) => segment.id)));
  }

  function toggleSegmentSelectionMode() {
    setSegmentSelectionMode((enabled) => {
      if (enabled) {
        setSelectedSegmentIds(new Set());
      }
      return !enabled;
    });
  }

  function toggleSegmentSelection(segmentId: string) {
    segmentSelectionAnchorRef.current = segmentId;
    setSelectedSegmentIds((previous) => {
      const next = new Set(previous);
      if (next.has(segmentId)) {
        next.delete(segmentId);
      } else {
        next.add(segmentId);
      }
      return next;
    });
  }

  function handleSegmentClick(event: ReactMouseEvent<HTMLElement>, segment: CaptionSegment) {
    if (segmentSelectionMode) {
      event.preventDefault();
      toggleSegmentSelection(segment.id);
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      selectSegmentRange(segment.id);
      return;
    }

    playSegment(segment);
  }

  function handleSegmentKeyDown(event: ReactKeyboardEvent<HTMLElement>, segment: CaptionSegment) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (segmentSelectionMode) {
      event.preventDefault();
      toggleSegmentSelection(segment.id);
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      selectSegmentRange(segment.id);
      return;
    }

    playSegment(segment);
  }

  function markTranscriptEditedForGeneratedMerge() {
    transcriptEditedRef.current = true;
  }

  function stopTranscriptPollingForUserEdit() {
    markTranscriptEditedForGeneratedMerge();
    transcriptRunRef.current += 1;
    setLoading(false);
    setTranscriptionStatus(null);
  }

  async function persistEditedTrack(
    segments: CaptionSegment[],
    nextActiveId?: string | null,
    nextPlayedIds?: Set<string>,
  ) {
    if (!track) return;
    markTranscriptEditedForGeneratedMerge();

    const updated: CaptionTrack = {
      ...track,
      fetchedAt: Date.now(),
      segments,
    };
    await saveTranscript(updated);
    trackRef.current = updated;
    setTrack(updated);
    setSelectedSegmentIds(new Set());

    const activeStillExists = activeSegmentId && segments.some((segment) => segment.id === activeSegmentId);
    const resolvedActiveId = nextActiveId ?? (activeStillExists ? activeSegmentId : segments[0]?.id ?? null);
    setActiveSegmentId(resolvedActiveId);
    setPracticeRange(
      resolvedActiveId ? segments.find((segment) => segment.id === resolvedActiveId) ?? null : null,
    );
    segmentSelectionAnchorRef.current = resolvedActiveId;

    const validSegmentIds = new Set(segments.map((segment) => segment.id));
    const normalizedPlayedIds = new Set(
      Array.from(nextPlayedIds ?? playedSegmentIdsRef.current).filter((segmentId) => validSegmentIds.has(segmentId)),
    );
    await persistStudyProgressSnapshot(resolvedActiveId, normalizedPlayedIds);
  }

  async function deleteSegment(segmentId: string) {
    if (!track) return;

    const deleteIndex = track.segments.findIndex((segment) => segment.id === segmentId);
    if (deleteIndex < 0) return;

    const segments = track.segments.filter((segment) => segment.id !== segmentId);
    const nextActiveId =
      activeSegmentId === segmentId
        ? segments[Math.min(deleteIndex, segments.length - 1)]?.id ?? null
        : activeSegmentId;

    await persistEditedTrack(segments, nextActiveId);
  }

  async function deleteSelectedSegments() {
    if (!track || selectedSegmentIds.size === 0) return;

    const selectedIndexes = track.segments
      .map((segment, index) => (selectedSegmentIds.has(segment.id) ? index : -1))
      .filter((index) => index >= 0);
    if (selectedIndexes.length === 0) return;

    const firstDeletedIndex = Math.min(...selectedIndexes);
    const selectedIds = new Set(selectedSegmentIds);
    const segments = track.segments.filter((segment) => !selectedIds.has(segment.id));
    const nextActiveId =
      activeSegmentId && !selectedIds.has(activeSegmentId)
        ? activeSegmentId
        : segments[Math.min(firstDeletedIndex, segments.length - 1)]?.id ?? null;

    await persistEditedTrack(segments, nextActiveId);
  }

  async function mergeSelectedSegments() {
    if (!track || selectedSegmentIds.size < 2) return;

    const selectedIndexes = track.segments
      .map((segment, index) => (selectedSegmentIds.has(segment.id) ? index : -1))
      .filter((index) => index >= 0);
    if (selectedIndexes.length < 2) return;

    const startIndex = Math.min(...selectedIndexes);
    const endIndex = Math.max(...selectedIndexes);
    if (selectedIndexes.length !== endIndex - startIndex + 1) {
      return;
    }

    const selectedSegments = track.segments.slice(startIndex, endIndex + 1);
    const merged = mergeCaptionSegments(selectedSegments);
    const segments = [
      ...track.segments.slice(0, startIndex),
      merged,
      ...track.segments.slice(endIndex + 1),
    ];

    const nextPlayedIds = new Set(playedSegmentIdsRef.current);
    for (const segment of selectedSegments) {
      nextPlayedIds.delete(segment.id);
    }
    nextPlayedIds.add(merged.id);
    await persistEditedTrack(segments, merged.id, nextPlayedIds);
  }

  async function splitCurrentSegmentIntoSegments() {
    if (!track || !currentSegment) return;

    const splitSegments = createSplitSegmentsForSegment(currentSegment);
    if (splitSegments.length < 2) {
      setError('This sentence cannot be split.');
      return;
    }

    const currentIndex = track.segments.findIndex((segment) => segment.id === currentSegment.id);
    if (currentIndex < 0) return;

    const currentTime = getCurrentPlaybackTime();
    const nextActiveSegment = findSegmentAtTime(splitSegments, currentTime) ?? splitSegments[0];
    const segments = [
      ...track.segments.slice(0, currentIndex),
      ...splitSegments,
      ...track.segments.slice(currentIndex + 1),
    ];

    const nextPlayedIds = new Set(playedSegmentIdsRef.current);
    nextPlayedIds.delete(currentSegment.id);
    nextPlayedIds.add(nextActiveSegment.id);
    await persistEditedTrack(segments, nextActiveSegment.id, nextPlayedIds);
    setError(null);
  }

  function playCurrentSegmentLine() {
    if (!currentSegment || !currentSegmentLine) return;
    stopRecordingForVideoPlayback();
    const rate = segmentPlaybackRates[currentSegment.id] ?? 1;
    suppressPlaybackSyncUntilPracticeRef.current = false;
    setActiveSegmentId(currentSegment.id);
    setPlaybackRate(rate);
    setPracticeRange(currentSegmentLine);
    setHasStartedPractice(true);
    playerRef.current?.playSegment(currentSegmentLine.start, rate, currentSegmentLine.end);
    void persistStudyProgress(currentSegment);
  }

  function changeRate(rate: number) {
    if (currentSegment) {
      setSegmentPlaybackRates((previous) => ({
        ...previous,
        [currentSegment.id]: rate,
      }));
    }
    setPlaybackRate(rate);
    playerRef.current?.setPlaybackRate(rate);
    if (currentSegment && hasStartedPractice) {
      stopRecordingForVideoPlayback();
      playerRef.current?.playSegment(currentSegment.start, rate, currentSegment.end);
    }
  }

  function startCurrentSegmentEdit() {
    if (!currentSegment) return;
    if (isEditingCurrentSegment) {
      cancelCurrentSegmentEdit();
      return;
    }

    stopRecordingForVideoPlayback();
    playerRef.current?.pause();
    setEditingSegmentId(currentSegment.id);
    setEditedSentenceText(currentSegment.text);
    setError(null);
  }

  function cancelCurrentSegmentEdit() {
    setEditingSegmentId(null);
    setEditedSentenceText('');
    setError(null);
  }

  async function saveCurrentSegmentEdit() {
    if (!track || !currentSegment || !isEditingCurrentSegment) return;

    const normalizedText = editedSentenceText.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      setError('Caption text cannot be empty.');
      return;
    }

    const source = currentSegment.source.includes('+edited') ? currentSegment.source : `${currentSegment.source}+edited`;
    const editedLine: CaptionLine = {
      id: `${currentSegment.id}_line`,
      text: normalizedText,
      start: currentSegment.start,
      end: currentSegment.end,
      duration: roundTime(Math.max(0, currentSegment.end - currentSegment.start)),
      source,
    };
    const updatedSegment: CaptionSegment = {
      ...currentSegment,
      text: normalizedText,
      source,
      lines: [editedLine],
      words: undefined,
    };
    const segments = track.segments.map((segment) =>
      segment.id === currentSegment.id ? updatedSegment : segment,
    );

    await persistEditedTrack(segments, updatedSegment.id);
    setEditingSegmentId(null);
    setEditedSentenceText('');
    setError(null);
  }

  async function saveCurrentSentenceNote() {
    if (!currentSegment) return;

    setSavingSentenceNote(true);
    try {
      const text = sentenceNoteText.trim();
      if (!text) {
        await deleteSentenceNote(id, currentSegment.id);
        await syncFavoriteNotesForSegment(id, currentSegment.id, undefined);
        setSentenceNoteText('');
        setSavedSentenceNoteText('');
        setEditingSentenceNote(false);
        return;
      }

      const note: SentenceNote = {
        id: `${id}:${currentSegment.id}`,
        videoId: id,
        segmentId: currentSegment.id,
        text,
        updatedAt: Date.now(),
      };
      await saveSentenceNote(note);
      await syncFavoriteNotesForSegment(id, currentSegment.id, text);
      setSentenceNoteText(text);
      setSavedSentenceNoteText(text);
      setEditingSentenceNote(false);
    } finally {
      setSavingSentenceNote(false);
    }
  }

  function cancelCurrentSentenceNoteEdit() {
    setSentenceNoteText(savedSentenceNoteText);
    setEditingSentenceNote(false);
  }

  function toggleCurrentSentenceNoteEdit() {
    if (editingSentenceNote) {
      cancelCurrentSentenceNoteEdit();
      return;
    }

    setEditingSentenceNote(true);
  }

  async function setCurrentFrameAsCover() {
    if (!video || video.sourceType !== 'local') return;

    setCaptionMenuOpen(false);
    try {
      const currentTime = playerRef.current?.getCurrentTime() ?? 0;
      const fingerprint = video.contentFingerprint;
      if (!fingerprint) {
        throw new Error('Local video is not ready.');
      }
      const thumbnailUrl = await platformBridge.video.setLocalCover(fingerprint, currentTime);

      const updatedVideo: SavedVideo = {
        ...video,
        thumbnailUrl,
      };
      await saveVideo(updatedVideo);
      setVideo(updatedVideo);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover update failed.');
    }
  }

  async function openWord(
    word: string,
    sentence: CaptionSegment | null,
    options: { allowContextWithoutWord?: boolean } = {},
  ) {
    const normalized = normalizeLookupWord(word);
    if (!normalized) return;
    setMobileSheetLevel('expanded');
    const exampleSentence =
      sentence && (options.allowContextWithoutWord || sentenceContainsWord(sentence.text, normalized))
        ? sentence
        : null;

    setSelectedWord({ word: normalized, sentence: exampleSentence, entry: null, loading: true });
    const targetLanguage = await loadDictionaryTargetLanguageSetting();
    const entry = await lookupWord(normalized, { targetLanguage });
    setSelectedWord({
      word: entry?.word ? normalizeLookupWord(entry.word) || entry.word : normalized,
      sentence: exampleSentence,
      entry,
      loading: false,
    });
    if (entry?.audio?.remoteUrl) {
      void cacheDictionaryEntryAudioForFavorite(entry).then((cachedEntry) => {
        if (!cachedEntry || cachedEntry === entry) return;
        setSelectedWord((current) => {
          if (!current || normalizeLookupWord(current.word) !== normalized) return current;
          return { ...current, entry: cachedEntry };
        });
      });
    }
  }

  function toggleMobileSheetFromHandle() {
    setMobileSheetLevel((level) => {
      if (level === 'peek') return 'sentence';
      if (level === 'sentence') return 'expanded';
      return 'peek';
    });
  }

  async function createAudioForFavoriteSentence(
    segment: CaptionSegment,
    options: { reason?: string } = {},
  ): Promise<{ playableUrl: string; audio: import('../lib/types').AudioAssetRef } | undefined> {
    if (video?.sourceType === 'local' && !video.contentFingerprint) {
      setError('Missing local video fingerprint.');
      return undefined;
    }

    try {
      void platformBridge.logs.frontendEvent('sentence-audio-create-requested', {
        videoId: id,
        segmentId: segment.id,
        sourceType: video?.sourceType ?? 'youtube',
        start: segment.start,
        end: segment.end,
        reason: options.reason ?? 'favorite',
      });
      const audioResult = await createSentenceAudioAsset({
        videoId: id,
        start: segment.start,
        end: segment.end,
        contentFingerprint: video?.sourceType === 'local' ? video.contentFingerprint : undefined,
      });
      void platformBridge.logs.frontendEvent('sentence-audio-create-complete', {
        videoId: id,
        segmentId: segment.id,
        hasAudioUrl: Boolean(audioResult.playableUrl),
        playableScheme: audioResult.playableUrl.split(':', 1)[0] || null,
        reason: options.reason ?? 'favorite',
      });
      return audioResult;
    } catch (err) {
      void platformBridge.logs.frontendEvent('sentence-audio-create-failed', {
        videoId: id,
        segmentId: segment.id,
        sourceType: video?.sourceType ?? 'youtube',
        start: segment.start,
        end: segment.end,
        reason: options.reason ?? 'favorite',
        error: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : 'Sentence audio failed.');
      return undefined;
    }
  }

  async function favoriteWord() {
    if (!selectedWord) return;
    const wordKey = createFavoriteWordKey(selectedWord.word, selectedWord.sentence?.text);
    void platformBridge.logs.frontendEvent('favorite-word-clicked', {
      videoId: id,
      word: selectedWord.word,
      wordKey,
      hasExampleSentence: Boolean(selectedWord.sentence),
      segmentId: selectedWord.sentence?.id,
      alreadySaved: favoriteWordKeys.has(wordKey),
      runtime: platformBridge.runtime(),
      sourceType: video?.sourceType ?? 'youtube',
    });
    if (favoriteWordKeys.has(wordKey)) {
      void platformBridge.logs.frontendEvent('favorite-word-skipped', {
        videoId: id,
        word: selectedWord.word,
        wordKey,
        reason: 'already-saved',
      });
      return;
    }

    setSavingFavorite(true);
    try {
      const sentenceAudio = selectedWord.sentence
        ? await createAudioForFavoriteSentence(selectedWord.sentence, { reason: 'word-create' })
        : undefined;
      const cachedWordEntry = await cacheDictionaryEntryAudioForFavorite(selectedWord.entry);
      const now = Date.now();
      const favorite: FavoriteWord = {
        id: createId('word'),
        word: selectedWord.word,
        ...(selectedWord.sentence
          ? {
              sentence: selectedWord.sentence.text,
              videoId: id,
              segmentId: selectedWord.sentence.id,
            }
          : {}),
        phonetic: cachedWordEntry?.phonetic,
        definition: formatDictionaryDefinition(cachedWordEntry),
        dictionaryEntry: cachedWordEntry ?? undefined,
        audio: cachedWordEntry?.audio,
        sentenceAudio: sentenceAudio?.audio,
        note: selectedWord.sentence ? currentSavedSentenceNote || undefined : undefined,
        wordNote: selectedWordNote || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await saveFavoriteWord(favorite);
      void platformBridge.logs.frontendEvent('favorite-word-saved', {
        videoId: id,
        word: selectedWord.word,
        wordKey,
        segmentId: selectedWord.sentence?.id,
        hasSentenceAudioUrl: Boolean(sentenceAudio?.audio),
      });
      setFavoriteWordKeys((previous) => new Set(previous).add(wordKey));
    } finally {
      setSavingFavorite(false);
    }
  }

  async function saveSelectedWordNote() {
    if (!selectedWord || savingWordNote) return;

    const normalizedWord = normalizeLookupWord(selectedWord.word);
    if (!normalizedWord) return;

    setSavingWordNote(true);
    try {
      const note = wordNoteText.trim();
      const words = await listFavoriteWords();
      const matchingWords = words.filter((word) => normalizeLookupWord(word.word) === normalizedWord);

      if (matchingWords.length === 0) {
        const now = Date.now();
        const cachedWordEntry = await cacheDictionaryEntryAudioForFavorite(selectedWord.entry);
        const favorite: FavoriteWord = {
          id: createId('word'),
          word: normalizedWord,
          phonetic: cachedWordEntry?.phonetic,
          definition: formatDictionaryDefinition(cachedWordEntry),
          dictionaryEntry: cachedWordEntry ?? undefined,
          audio: cachedWordEntry?.audio,
          wordNote: note || undefined,
          createdAt: now,
          updatedAt: now,
        };
        await saveFavoriteWord(favorite);
        setFavoriteWordKeys((previous) => new Set(previous).add(createFavoriteWordKey(normalizedWord)));
      } else {
        const cachedWordEntry = await cacheDictionaryEntryAudioForFavorite(selectedWord.entry);
        await Promise.all(
          matchingWords.map((word) =>
            saveFavoriteWord({
              ...word,
              phonetic: word.phonetic ?? cachedWordEntry?.phonetic,
              definition: pickLongerText(word.definition, formatDictionaryDefinition(cachedWordEntry)),
              dictionaryEntry: pickDictionaryEntry(word.dictionaryEntry, cachedWordEntry),
              audio: pickAudioAssetRef(word.audio, cachedWordEntry?.audio),
              wordNote: note || undefined,
            }),
          ),
        );
      }

      setWordNotesByWord((previous) => {
        const next = new Map(previous);
        if (note) {
          next.set(normalizedWord, note);
        } else {
          next.delete(normalizedWord);
        }
        return next;
      });
      setWordNoteText(note);
      setEditingWordNote(false);
    } finally {
      setSavingWordNote(false);
    }
  }

  function cancelSelectedWordNoteEdit() {
    setWordNoteText(selectedWordNote);
    setEditingWordNote(false);
  }

  async function favoriteCurrentSentence() {
    if (!currentSegment) return;
    void platformBridge.logs.frontendEvent('favorite-sentence-clicked', {
      videoId: id,
      segmentId: currentSegment.id,
      alreadySaved: favoriteSentenceIds.has(currentSegment.id),
      runtime: platformBridge.runtime(),
      sourceType: video?.sourceType ?? 'youtube',
      start: currentSegment.start,
      end: currentSegment.end,
    });
    if (favoriteSentenceIds.has(currentSegment.id)) {
      void platformBridge.logs.frontendEvent('favorite-sentence-skipped', {
        videoId: id,
        segmentId: currentSegment.id,
        reason: 'already-saved',
      });
      return;
    }

    setSavingFavorite(true);
    try {
      const audioResult = await createAudioForFavoriteSentence(currentSegment, { reason: 'sentence-create' });
      const now = Date.now();
      await saveFavoriteSentence({
        id: createId('sentence'),
        text: currentSegment.text,
        videoId: id,
        segmentId: currentSegment.id,
        start: currentSegment.start,
        end: currentSegment.end,
        audio: audioResult?.audio,
        note: currentSavedSentenceNote || undefined,
        createdAt: now,
        updatedAt: now,
      });
      void platformBridge.logs.frontendEvent('favorite-sentence-saved', {
        videoId: id,
        segmentId: currentSegment.id,
        hasAudioUrl: Boolean(audioResult?.audio),
      });
      setFavoriteSentenceIds((previous) => new Set(previous).add(currentSegment.id));
    } finally {
      setSavingFavorite(false);
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;

      if (currentSegment && !hasStartedPractice) {
        playSegment(currentSegment);
      } else {
        stopRecordingForVideoPlayback();
        playerRef.current?.togglePlay();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [currentSegment, hasStartedPractice, isRecordingPlaying, playbackRate]);

  function renderSentenceCard() {
    return (
      <section className="sentence-card">
        <div className="sentence-card-header">
          <span className="eyebrow">{t('currentSentence')}</span>
          {currentSegment && (
            <div className="rate-group current-sentence-rate-group" aria-label="Current sentence playback rate">
              {showWordUnderlineToggle && (
                <button
                  className={[
                    'chip',
                    'word-underline-toggle',
                    wordUnderlineEnabled && currentSegmentHasTimedWords ? 'active' : '',
                    !currentSegmentHasTimedWords ? 'unavailable' : '',
                  ].join(' ')}
                  onClick={() => void toggleWordUnderline()}
                  disabled={!currentSegmentHasTimedWords}
                  title={
                    currentSegmentHasTimedWords
                      ? wordUnderlineEnabled
                        ? t('hideWordUnderline')
                        : t('openWordUnderline')
                      : t('captionEditedNeedsTiming')
                  }
                  aria-label={
                    currentSegmentHasTimedWords
                      ? wordUnderlineEnabled
                        ? t('hideWordUnderline')
                        : t('openWordUnderline')
                      : t('captionEditedNeedsTiming')
                  }
                  aria-pressed={wordUnderlineEnabled}
                >
                  <Underline size={16} />
                </button>
              )}
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  className={rate === playbackRate ? 'chip active' : 'chip'}
                  onClick={() => changeRate(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>

        {currentSegment ? (
          <>
            <div className="current-sentence-lines">
              {currentSegmentLine && (
                <div
                  className={[
                    'current-line',
                    practiceRange?.id === currentSegmentLine.id ? 'active' : '',
                    isEditingCurrentSegment ? 'editing' : '',
                  ].join(' ')}
                  key={currentSegmentLine.id}
                >
                  {isEditingCurrentSegment ? (
                    <textarea
                      className="current-line-editor"
                      value={editedSentenceText}
                      rows={1}
                      onChange={(event) => setEditedSentenceText(event.currentTarget.value)}
                    />
                  ) : (
                    <div
                      className="current-line-play"
                      role="button"
                      tabIndex={0}
                      onClick={playCurrentSegmentLine}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          playCurrentSegmentLine();
                        }
                      }}
                    >
                      <TimedLineText
                        line={currentSegmentLine}
                        segment={currentSegment}
                        underlineEnabled={wordUnderlineEnabled}
                        getCurrentTime={getCurrentPlaybackTime}
                        onWord={(word) => void openWord(word, currentSegment)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {(editingSentenceNote || hasSavedSentenceNote) && (
              <div className={editingSentenceNote ? 'sentence-note-panel editing' : 'sentence-note-panel'}>
                {editingSentenceNote ? (
                  <>
                    <textarea
                      value={sentenceNoteText}
                      onChange={(event) => setSentenceNoteText(event.currentTarget.value)}
                      placeholder={t('addNote')}
                      rows={3}
                      autoFocus
                    />
                    <div className="sentence-note-actions">
                      <button type="button" onClick={cancelCurrentSentenceNoteEdit} disabled={savingSentenceNote}>
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={saveCurrentSentenceNote}
                        disabled={!sentenceNoteChanged || savingSentenceNote}
                      >
                        {savingSentenceNote ? t('saving') : t('save')}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="sentence-note-preview"
                    onClick={() => setEditingSentenceNote(true)}
                    title={t('editNote')}
                  >
                    {savedSentenceNoteText}
                  </button>
                )}
              </div>
            )}

            <div className="sentence-controls">
              {isEditingCurrentSegment ? (
                <div className="sentence-action-row editing">
                  <button
                    className="saved-icon-button active"
                    onClick={startCurrentSegmentEdit}
                    title={t('closeEditor')}
                    aria-label={t('closeEditor')}
                  >
                    <Edit3 size={17} />
                  </button>
                  <button
                    className="saved-icon-button primary-action"
                    onClick={saveCurrentSegmentEdit}
                    title={t('save')}
                    aria-label={t('save')}
                  >
                    <Check size={17} />
                  </button>
                </div>
              ) : (
                <div className="sentence-action-row sentence-three-column-actions">
                  <div className="sentence-action-left">
                    <span className="sentence-action-item">
                      <button
                        className="saved-icon-button"
                        onClick={startCurrentSegmentEdit}
                        title={t('editCaption')}
                        aria-label={t('editCaption')}
                      >
                        <Edit3 size={17} />
                      </button>
                      <span className="sentence-action-label">{t('actionEdit')}</span>
                    </span>
                    <span className="sentence-action-item">
                      <button
                        className={editingSentenceNote ? 'saved-icon-button active' : 'saved-icon-button'}
                        onClick={toggleCurrentSentenceNoteEdit}
                        title={editingSentenceNote ? t('close') : hasSavedSentenceNote ? t('editNote') : t('addNote')}
                        aria-label={editingSentenceNote ? t('close') : hasSavedSentenceNote ? t('editNote') : t('addNote')}
                      >
                        <MessageSquare size={17} />
                      </button>
                      <span className="sentence-action-label">{t('actionNote')}</span>
                    </span>
                  </div>
                  <div className="recording-actions" aria-label={t('currentSentenceRecording')}>
                    <span className="sentence-action-item">
                      <button
                        className={isRecording ? 'saved-icon-button recording active' : 'saved-icon-button recording'}
                        onClick={toggleRecording}
                        title={isRecording ? t('stopRecording') : t('currentSentenceRecording')}
                        aria-label={isRecording ? t('stopRecording') : t('currentSentenceRecording')}
                      >
                        {isRecording ? <Square size={16} /> : <Mic size={17} />}
                      </button>
                      <span className="sentence-action-label">{t('actionRecord')}</span>
                    </span>
                    <span className="sentence-action-item">
                      <button
                        className={isRecordingPlaying ? 'saved-icon-button active' : 'saved-icon-button'}
                        onClick={toggleRecordingPlayback}
                        title={recordingUrl ? (isRecordingPlaying ? t('pauseRecordingPlayback') : t('playRecording')) : t('noRecording')}
                        aria-label={recordingUrl ? (isRecordingPlaying ? t('pauseRecordingPlayback') : t('playRecording')) : t('noRecording')}
                        disabled={!recordingUrl || isRecording}
                      >
                        <Play size={17} />
                      </button>
                      <span className="sentence-action-label">{t('actionPlayRecording')}</span>
                    </span>
                  </div>
                  <div className="sentence-action-right">
                    <span className="sentence-action-item">
                      <button
                        className="saved-icon-button"
                        onClick={splitCurrentSegmentIntoSegments}
                        title={currentSegmentCanSplit ? t('splitByWordTiming') : t('splitNeedsTiming')}
                        aria-label={currentSegmentCanSplit ? t('splitByWordTiming') : t('splitNeedsTiming')}
                        disabled={!currentSegmentCanSplit}
                      >
                        <Scissors size={17} />
                      </button>
                      <span className="sentence-action-label">{t('actionTrim')}</span>
                    </span>
                    <span className="sentence-action-item">
                      <button
                        className={currentSentenceSaved ? 'saved-icon-button active' : 'saved-icon-button'}
                        onClick={favoriteCurrentSentence}
                        title={currentSentenceSaved ? t('saved') : t('favoriteSentence')}
                        aria-label={currentSentenceSaved ? t('saved') : t('favoriteSentence')}
                        disabled={savingFavorite}
                      >
                        {savingFavorite ? <Loader2 className="spin" size={17} /> : <BookmarkCheck size={17} />}
                      </button>
                      <span className="sentence-action-label">{t('actionFavorite')}</span>
                    </span>
                  </div>
                </div>
              )}
              {recordingError && <p className="recording-error">{recordingError}</p>}
            </div>
          </>
        ) : (
          <p className="muted current-sentence-empty">{t('captionLoadingCurrent')}</p>
        )}
      </section>
    );
  }

  function renderDictionaryPanel() {
    return (
      <section className="dictionary-panel">
        <div className="panel-title flat-title dictionary-title-row">
          <h2>
            <Languages size={18} />
            {t('dictionaryTitle')}
          </h2>
          <form
            className="word-search-form title-word-search"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const nextWord = String(formData.get('word') ?? '');
              const sentence = currentSegment && sentenceContainsWord(currentSegment.text, normalizeLookupWord(nextWord))
                ? currentSegment
                : null;
              openWord(nextWord, sentence);
            }}
          >
            <input
              key={selectedWord?.word ?? 'empty-word-search'}
              name="word"
              defaultValue={selectedWord?.word ?? ''}
              aria-label={t('searchWord')}
              placeholder={t('searchWordPlaceholder')}
            />
            <button type="submit" title={t('search')}>
              <Search size={16} />
            </button>
          </form>
        </div>

        {!selectedWord && <p className="muted">{t('dictionaryEmpty')}</p>}

        {selectedWord?.loading && (
          <div className="status-panel compact-status dictionary-loading-panel">
            <Loader2 className="spin" size={22} />
            <p>{t('dictionaryLoading')}</p>
          </div>
        )}

        {selectedWord && !selectedWord.loading && (
          <div className="word-result">
            <div className="word-heading">
              <div className="word-name-row">
                <h2>{selectedWord.word}</h2>
                <button
                  className={selectedWordSaved ? 'word-save-icon active' : 'word-save-icon'}
                  onClick={favoriteWord}
                  title={selectedWordSaved ? t('saved') : t('favoriteWord')}
                  disabled={savingFavorite}
                >
                  {savingFavorite ? <Loader2 className="spin" size={17} /> : selectedWordSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                </button>
                <button
                  className={editingWordNote || hasSelectedWordNote ? 'word-note-icon active' : 'word-note-icon'}
                  onClick={() => setEditingWordNote((editing) => !editing)}
                  title={editingWordNote ? t('close') : hasSelectedWordNote ? t('editNote') : t('addNote')}
                  type="button"
                >
                  <MessageSquare size={15} />
                </button>
              </div>
              {(selectedWord.entry?.phonetic || isPlayableAudio(selectedWord.entry?.audio)) && (
                <div className="word-pronunciation-row">
                  {isPlayableAudio(selectedWord.entry?.audio) ? (
                    <button
                      className="phonetic-audio-line muted"
                      title={t('playPronunciation')}
                      onClick={() => void playAudio(selectedWord.entry?.audio)}
                    >
                      {selectedWord.entry?.phonetic && <span>{formatPhonetic(selectedWord.entry.phonetic)}</span>}
                      <Volume2 size={15} />
                    </button>
                  ) : (
                    <p className="muted phonetic-line">{formatPhonetic(selectedWord.entry?.phonetic)}</p>
                  )}
                </div>
              )}
            </div>
            {(editingWordNote || hasSelectedWordNote) && (
              <div className={editingWordNote ? 'word-note-panel editing' : 'word-note-panel'}>
                {editingWordNote ? (
                  <>
                    <textarea
                      value={wordNoteText}
                      placeholder={t('wordNotePlaceholder')}
                      onChange={(event) => setWordNoteText(event.currentTarget.value)}
                      rows={3}
                    />
                    <div className="word-note-actions">
                      <button type="button" onClick={cancelSelectedWordNoteEdit} disabled={savingWordNote}>
                        {t('cancel')}
                      </button>
                      <button type="button" onClick={saveSelectedWordNote} disabled={!wordNoteChanged || savingWordNote}>
                        {savingWordNote ? t('saving') : t('save')}
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="word-note-preview" type="button" onClick={() => setEditingWordNote(true)}>
                    {selectedWordNote}
                  </button>
                )}
              </div>
            )}
            {selectedWord.entry ? (
              <DictionaryEntryContent
                entry={selectedWord.entry}
                onDefinitionWord={(definitionWord) =>
                  openWord(
                    definitionWord,
                    selectedWordExampleSentence ?? currentSegment,
                    { allowContextWithoutWord: true },
                  )
                }
              />
            ) : (
              <p className="muted">
                {selectedWordExampleSentence
                  ? t('dictionaryNoResultWithExample')
                  : t('dictionaryNoResult')}
              </p>
            )}
            {selectedWordExampleSentence && <blockquote>{selectedWordExampleSentence.text}</blockquote>}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="detail-page-fixed">
      <div className="video-header detail-titlebar">
        <div className="detail-title-main">
          <button className="bare-icon-button title-back-button" title={t('backToLibrary')} onClick={() => navigate({ name: 'home' })}>
            <ArrowLeft size={20} />
          </button>
          <h1>{video?.title ?? id}</h1>
          <div className="more-menu-wrap">
            <button
              className="bare-icon-button"
              title={t('moreSettings')}
              onClick={() => setCaptionMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={18} />
            </button>
            {captionMenuOpen && (
              <div className="more-menu">
                {video?.sourceType === 'local' && (
                  <button onClick={setCurrentFrameAsCover}>
                    <Video size={16} />
                    {t('saveCoverFromFrame')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setCaptionMenuOpen(false);
                    loadTranscript(true);
                  }}
                >
                  <RefreshCcw size={16} />
                  {t('regenerateCaptions')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="detail-workspace">
        <div className="study-column">
          {!video ? (
            <div className="player-shell local-player-missing">{t('playerLoading')}</div>
          ) : video.sourceType === 'local' ? (
            localVideoSourceUrl ? (
              <LocalVideoPlayer
                ref={playerRef}
                video={localVideoSourceUrl}
                title={video.title}
                onReady={() => {
                  const seekTime = seekAfterReloadRef.current;
                  if (seekTime !== null && seekTime > 0) {
                    seekAfterReloadRef.current = null;
                    playerRef.current?.seekTo(seekTime);
                  }
                }}
                labels={{
                  controls: t('localVideoControls'),
                  fullscreen: t('fullscreen'),
                  pause: t('pause'),
                  play: t('play'),
                }}
              />
            ) : localVideoSourceLoading ? (
              <div className="player-shell local-player-missing">
                <Loader2 className="spin" size={30} />
                <p>{t('localVideoOpening')}</p>
              </div>
            ) : (
              <div className="player-shell local-player-missing">
                <Video size={30} />
                <p>{t('localVideoMissing')}</p>
              </div>
            )
          ) : (
            <YouTubePlayer ref={playerRef} videoId={id} loadingLabel={t('playerLoading')} />
          )}
          {video?.sourceType === 'local' && (getLocalAudioWarning(video, t) || audioTranscodeRemaining !== null) && (
            <div className="inline-status audio-warning">
              {audioTranscodeRemaining !== null
                ? <Loader2 size={16} className="spin" />
                : <Volume2 size={16} />}
              <span>
                {audioTranscodeRemaining !== null
                  ? audioTranscodeRemaining > 0
                    ? t('audioConverting', { remaining: formatTranscodeRemaining(audioTranscodeRemaining) })
                    : t('audioConvertingAlmost')
                  : getLocalAudioWarning(video, t)}
              </span>
            </div>
          )}

          <div className="transcript-panel transcript-under-video">
            {loading && !track && (
              <div className="status-panel transcript-loading-panel">
                <Loader2 className="spin" size={24} />
                <p>{transcriptionStatus ?? (video?.sourceType === 'local' ? t('transcriptLocalPreparing') : t('transcriptYouTubePreparing'))}</p>
              </div>
            )}

            {track && transcriptionStatus && (
              <div className="inline-status">
                <Loader2 className="spin" size={16} />
                <span>{transcriptionStatus}</span>
              </div>
            )}

            {!loading && error && (
              <div className="status-panel error">
                <p>{error}</p>
                <div className="status-actions">
                  <button className="secondary-button compact-button" type="button" onClick={() => loadTranscript(true)}>
                    <RefreshCcw size={15} />
                    {t('transcriptRetry')}
                  </button>
                  {platformBridge.isDesktop() && (
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => platformBridge.settings.openBridgeLogs()}
                    >
                      <FileText size={15} />
                      {t('openLogs')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {track && (
              <>
                <div className="transcript-list-header">
                  <div className="transcript-list-meta">
                    <label
                      className={segmentSelectionMode ? 'segment-selection-toggle active' : 'segment-selection-toggle'}
                      title={segmentSelectionMode ? t('close') : t('selectCaption')}
                    >
                      <input
                        type="checkbox"
                        checked={segmentSelectionMode}
                        onChange={toggleSegmentSelectionMode}
                      />
                      <span aria-hidden="true" />
                    </label>
                    <span className="transcript-list-title">{t('captions')}</span>
                    <span className="transcript-list-count">{visibleSegments.length} / {track.segments.length}</span>
                    <button
                      type="button"
                      className={showFavoriteOnly ? 'transcript-inline-filter active' : 'transcript-inline-filter'}
                      onClick={() => setShowFavoriteOnly((value) => !value)}
                      title={t('showFavoritesOnly')}
                      aria-label={t('showFavoritesOnly')}
                    >
                      <Filter size={16} />
                    </button>
                    {selectedSegmentIds.size > 0 && <strong>{t('selectedCaptions', { count: selectedSegmentIds.size })}</strong>}
                  </div>
                  <div className="transcript-list-actions">
                    {selectedSegmentIds.size > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={mergeSelectedSegments}
                          disabled={!selectedSegmentsAreContiguous}
                          title={
                            selectedSegmentIds.size < 2
                              ? t('mergeContiguousOnly')
                              : selectedSegmentsAreContiguous
                                ? t('mergeSelectedCaptions')
                                : t('mergeContiguousOnly')
                          }
                        >
                          {t('merge')}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="danger icon-danger"
                      disabled={selectedSegmentIds.size === 0 && !currentSegment}
                      onClick={() => {
                        if (selectedSegmentIds.size > 0) {
                          void deleteSelectedSegments();
                          return;
                        }
                        if (currentSegment) {
                          void deleteSegment(currentSegment.id);
                        }
                      }}
                      title={selectedSegmentIds.size > 0 ? t('delete') : t('delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div
                  ref={segmentListRef}
                  className={segmentSelectionMode ? 'segment-list selection-mode' : 'segment-list'}
                >
                  {visibleSegments.map((segment, index) => {
                    const isActive = activeSegmentId === segment.id;
                    const isSelected = selectedSegmentIds.has(segment.id);
                    const isFavoriteSegment = favoriteSentenceIds.has(segment.id);
                    const hasPlayedFill = playedSegmentIds.has(segment.id) && !isActive && !isSelected;
                    const previousSegment = visibleSegments[index - 1];
                    const nextSegment = visibleSegments[index + 1];
                    const previousHasPlayedFill =
                      previousSegment &&
                      playedSegmentIds.has(previousSegment.id) &&
                      activeSegmentId !== previousSegment.id &&
                      !selectedSegmentIds.has(previousSegment.id);
                    const nextHasPlayedFill =
                      nextSegment &&
                      playedSegmentIds.has(nextSegment.id) &&
                      activeSegmentId !== nextSegment.id &&
                      !selectedSegmentIds.has(nextSegment.id);
                    const playedGroupClass = hasPlayedFill
                      ? !previousHasPlayedFill && !nextHasPlayedFill
                        ? 'played-single'
                        : !previousHasPlayedFill
                          ? 'played-start'
                          : !nextHasPlayedFill
                            ? 'played-end'
                            : 'played-middle'
                      : '';

                    return (
                      <article
                        ref={(node) => {
                          segmentRefs.current[segment.id] = node;
                        }}
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        className={[
                          'segment',
                          isActive ? 'active' : '',
                          isSelected ? 'selected' : '',
                          playedSegmentIds.has(segment.id) ? 'played' : 'unplayed',
                          hasPlayedFill ? 'played-fill' : '',
                          playedGroupClass,
                          lastStudySegmentId === segment.id ? 'last-studied' : '',
                        ].join(' ')}
                        onClick={(event) => handleSegmentClick(event, segment)}
                        onKeyDown={(event) => handleSegmentKeyDown(event, segment)}
                      >
                        {segmentSelectionMode && (
                          <label
                            className="segment-select-entry"
                            title={isSelected ? t('cancel') : t('selectCaption')}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSegmentSelection(segment.id)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span aria-hidden="true" />
                          </label>
                        )}
                        <div className="segment-body">
                          <span className="segment-meta-line">
                            <span className="segment-time">{formatRange(segment.start, segment.end)}</span>
                            {isFavoriteSegment && (
                              <span className="segment-favorite-mark" title={t('saved')} aria-label={t('saved')}>
                                <BookmarkCheck size={13} />
                              </span>
                            )}
                          </span>
                          <span className="segment-text">{segment.text}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {!isMobileViewport && (
          <aside className="sentence-panel desktop-sentence-panel">
            {renderSentenceCard()}
            {renderDictionaryPanel()}
          </aside>
        )}
        {isMobileViewport && (
          <>
            {/* iOS Safari 底部工具栏不会可靠采样 react-modal-sheet 的 portal/transform 容器，需在页面底部放一个固定白色采样层。 */}
            <div className="mobile-sheet-bottom-sampler" aria-hidden="true" />
            <Sheet
              ref={mobileSheetRef}
              isOpen
              disableDismiss
              initialSnap={mobileSheetLevelToSnapIndex(mobileSheetLevel)}
              snapPoints={MOBILE_SHEET_SNAP_POINTS}
              onClose={() => setMobileSheetLevel('peek')}
              onSnap={(snapIndex) => setMobileSheetLevel(snapIndexToMobileSheetLevel(snapIndex))}
            >
              <Sheet.Container
                className={selectedWord ? 'mobile-sentence-sheet-container has-word' : 'mobile-sentence-sheet-container'}
              >
                <Sheet.Header className="mobile-sentence-sheet-header" onClick={toggleMobileSheetFromHandle}>
                  <span className="mobile-sentence-sheet-indicator" aria-hidden="true" />
                </Sheet.Header>
                <Sheet.Content
                  className="mobile-sentence-sheet-content"
                  scrollClassName="mobile-sentence-sheet-scroll"
                  disableScroll={({ currentSnap }) =>
                    currentSnap !== MOBILE_SHEET_EXPANDED_SNAP_INDEX
                  }
                >
                  <div className="mobile-sheet-content">
                    {renderSentenceCard()}
                    {renderDictionaryPanel()}
                  </div>
                </Sheet.Content>
              </Sheet.Container>
            </Sheet>
          </>
        )}
      </div>
    </section>
  );
}
