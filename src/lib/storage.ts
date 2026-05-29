import type {
  CaptionTrack,
  FavoriteSentence,
  FavoriteWord,
  ReviewCard,
  ReviewLog,
  ReviewProgress,
  SavedVideo,
  SentenceNote,
  StudyProgress,
} from './types';

export interface FavoritePage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

interface AppSetting {
  id: string;
  value: unknown;
  updatedAt: number;
}

type BackendStore =
  | 'appSettings'
  | 'videos'
  | 'transcripts'
  | 'favoriteWords'
  | 'favoriteSentences'
  | 'studyProgress'
  | 'sentenceNotes'
  | 'reviewProgress'
  | 'reviewCards'
  | 'reviewLogs';

export async function getAppSetting<T>(id: string): Promise<T | undefined> {
  const setting = await backendGet<AppSetting>('appSettings', id);
  return setting?.value as T | undefined;
}

export async function saveAppSetting(id: string, value: unknown): Promise<void> {
  await backendSave('appSettings', {
    id,
    value,
    updatedAt: Date.now(),
  });
}

export async function syncLocalStorageToBackend(): Promise<void> {
  // Desktop builds now use the app storage API as the only source of truth.
}

export async function listVideos(): Promise<SavedVideo[]> {
  const videos = await backendList<SavedVideo>('videos');
  return activeItems(videos).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveVideo(video: SavedVideo): Promise<void> {
  await backendSave('videos', {
    ...video,
    updatedAt: Date.now(),
    deletedAt: undefined,
  });
}

export async function getVideo(id: string): Promise<SavedVideo | undefined> {
  const video = await backendGet<SavedVideo>('videos', id);
  return video?.deletedAt == null ? video : undefined;
}

export async function deleteVideo(id: string): Promise<void> {
  const existing = await backendGet<SavedVideo>('videos', id);
  const now = Date.now();
  if (!existing) {
    await backendSave('videos', {
      id,
      videoId: id,
      url: '',
      title: '',
      thumbnailUrl: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });
    return;
  }
  await backendSave('videos', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function getCachedTranscript(videoId: string): Promise<CaptionTrack | undefined> {
  const track = await backendGet<CaptionTrack>('transcripts', videoId);
  return track?.deletedAt == null ? track : undefined;
}

export async function saveTranscript(track: CaptionTrack): Promise<void> {
  await backendSave('transcripts', {
    ...track,
    updatedAt: Date.now(),
    deletedAt: undefined,
  });
}

export async function deleteTranscript(videoId: string): Promise<void> {
  const existing = await backendGet<CaptionTrack>('transcripts', videoId);
  const now = Date.now();
  if (!existing) {
    await backendDelete('transcripts', videoId);
    return;
  }
  await backendSave('transcripts', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function listFavoriteWords(): Promise<FavoriteWord[]> {
  const words = await backendList<FavoriteWord>('favoriteWords');
  return activeItems(words).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listFavoriteWordsPage(limit: number, offset: number): Promise<FavoritePage<FavoriteWord>> {
  const page = await backendListPage<FavoriteWord>('favoriteWords', limit, offset);
  return {
    ...page,
    items: activeItems(page.items),
  };
}

export async function searchFavoriteWordsPage(
  keyword: string,
  limit: number,
  offset: number,
): Promise<FavoritePage<FavoriteWord>> {
  const page = await backendListPage<FavoriteWord>('favoriteWords', limit, offset, keyword);
  return {
    ...page,
    items: activeItems(page.items),
  };
}

export async function saveFavoriteWord(word: FavoriteWord): Promise<void> {
  await backendSave('favoriteWords', {
    ...word,
    updatedAt: Date.now(),
  });
}

export async function deleteFavoriteWord(id: string): Promise<void> {
  const existing = await backendGet<FavoriteWord>('favoriteWords', id);
  if (!existing) {
    await backendDelete('favoriteWords', id);
    return;
  }
  const now = Date.now();
  await backendSave('favoriteWords', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function listFavoriteSentences(): Promise<FavoriteSentence[]> {
  const sentences = await backendList<FavoriteSentence>('favoriteSentences');
  return activeItems(sentences).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listFavoriteSentencesPage(
  limit: number,
  offset: number,
): Promise<FavoritePage<FavoriteSentence>> {
  const page = await backendListPage<FavoriteSentence>('favoriteSentences', limit, offset);
  return {
    ...page,
    items: activeItems(page.items),
  };
}

export async function searchFavoriteSentencesPage(
  keyword: string,
  limit: number,
  offset: number,
): Promise<FavoritePage<FavoriteSentence>> {
  const page = await backendListPage<FavoriteSentence>('favoriteSentences', limit, offset, keyword);
  return {
    ...page,
    items: activeItems(page.items),
  };
}

export async function saveFavoriteSentence(sentence: FavoriteSentence): Promise<void> {
  await backendSave('favoriteSentences', {
    ...sentence,
    updatedAt: Date.now(),
  });
}

export async function deleteFavoriteSentence(id: string): Promise<void> {
  const existing = await backendGet<FavoriteSentence>('favoriteSentences', id);
  if (!existing) {
    await backendDelete('favoriteSentences', id);
    return;
  }
  const now = Date.now();
  await backendSave('favoriteSentences', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function listReviewProgress(): Promise<ReviewProgress[]> {
  return backendList<ReviewProgress>('reviewProgress');
}

export async function saveReviewProgress(progress: ReviewProgress): Promise<void> {
  await backendSave('reviewProgress', progress);
}

export async function deleteReviewProgress(id: string): Promise<void> {
  await backendDelete('reviewProgress', id);
}

export async function listReviewCards(): Promise<ReviewCard[]> {
  const cards = await backendList<ReviewCard>('reviewCards');
  return activeItems(cards);
}

export async function saveReviewCard(card: ReviewCard): Promise<void> {
  await backendSave('reviewCards', card);
}

export async function deleteReviewCard(id: string): Promise<void> {
  const existing = await backendGet<ReviewCard>('reviewCards', id);
  const now = Date.now();
  if (!existing) {
    await backendDelete('reviewCards', id);
    return;
  }
  await backendSave('reviewCards', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function listReviewLogs(): Promise<ReviewLog[]> {
  const logs = await backendList<ReviewLog>('reviewLogs');
  return activeItems(logs);
}

export async function saveReviewLog(log: ReviewLog): Promise<void> {
  await backendSave('reviewLogs', log);
}

export async function deleteReviewLog(id: string): Promise<void> {
  const existing = await backendGet<ReviewLog>('reviewLogs', id);
  const now = Date.now();
  if (!existing) {
    await backendDelete('reviewLogs', id);
    return;
  }
  await backendSave('reviewLogs', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function getStudyProgress(videoId: string): Promise<StudyProgress | undefined> {
  return backendGet<StudyProgress>('studyProgress', videoId);
}

export async function listStudyProgress(): Promise<StudyProgress[]> {
  const progress = await backendList<StudyProgress & { deletedAt?: number }>('studyProgress');
  return activeItems(progress);
}

export async function saveStudyProgress(progress: StudyProgress): Promise<void> {
  await backendSave('studyProgress', progress);
}

export async function deleteStudyProgress(videoId: string): Promise<void> {
  const existing = await backendGet<StudyProgress>('studyProgress', videoId);
  const now = Date.now();
  if (!existing) {
    await backendDelete('studyProgress', videoId);
    return;
  }
  await backendSave('studyProgress', {
    ...existing,
    updatedAt: now,
    deletedAt: now,
  });
}

export async function getSentenceNote(videoId: string, segmentId: string): Promise<SentenceNote | undefined> {
  const note = await backendGet<SentenceNote>('sentenceNotes', createSentenceNoteId(videoId, segmentId));
  return note?.deletedAt == null ? note : undefined;
}

export async function saveSentenceNote(note: SentenceNote): Promise<void> {
  await backendSave('sentenceNotes', {
    ...note,
    updatedAt: Date.now(),
    deletedAt: undefined,
  });
}

export async function deleteSentenceNote(videoId: string, segmentId: string): Promise<void> {
  const id = createSentenceNoteId(videoId, segmentId);
  const existing = await backendGet<SentenceNote>('sentenceNotes', id);
  const now = Date.now();
  await backendSave('sentenceNotes', {
    id,
    videoId,
    segmentId,
    text: existing?.text ?? '',
    updatedAt: now,
    deletedAt: now,
  });
}

export async function syncFavoriteNotesForSegment(
  videoId: string,
  segmentId: string,
  note: string | undefined,
): Promise<void> {
  const [words, sentences] = await Promise.all([listFavoriteWords(), listFavoriteSentences()]);
  const matchingWords = words
    .filter((word) => word.videoId === videoId && word.segmentId === segmentId)
    .map((word) => withOptionalNote(word, note));
  const matchingSentences = sentences
    .filter((sentence) => sentence.videoId === videoId && sentence.segmentId === segmentId)
    .map((sentence) => withOptionalNote(sentence, note));

  await Promise.all([
    ...matchingWords.map((word) => saveFavoriteWord(word)),
    ...matchingSentences.map((sentence) => saveFavoriteSentence(sentence)),
  ]);
}

export function createSentenceNoteId(videoId: string, segmentId: string): string {
  return `${videoId}:${segmentId}`;
}

function withOptionalNote<T extends { note?: string }>(item: T, note: string | undefined): T {
  if (note) {
    return { ...item, note };
  }

  const { note: _note, ...rest } = item;
  return rest as T;
}

function activeItems<T extends { deletedAt?: number }>(items: T[]): T[] {
  return items.filter((item) => item.deletedAt == null);
}

async function backendList<T>(store: BackendStore): Promise<T[]> {
  const response = await fetch(`/api/app-storage?store=${encodeURIComponent(store)}`);
  if (!response.ok) {
    throw new Error(`Failed to read ${store}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T[];
}

async function backendListPage<T>(
  store: BackendStore,
  limit: number,
  offset: number,
  search?: string,
): Promise<FavoritePage<T>> {
  const params = new URLSearchParams({
    store,
    limit: String(limit),
    offset: String(offset),
    sort: 'createdAt',
    direction: 'desc',
  });
  if (search?.trim()) {
    params.set('search', search.trim());
  }
  const response = await fetch(`/api/app-storage?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to read ${store} page: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as Partial<FavoritePage<T>>;
  if (!Array.isArray(payload.items)) {
    throw new Error(`Failed to read ${store} page: invalid response shape.`);
  }

  return {
    items: payload.items,
    total: typeof payload.total === 'number' ? payload.total : payload.items.length,
    hasMore: Boolean(payload.hasMore),
  };
}

async function backendGet<T>(store: BackendStore, id: string): Promise<T | undefined> {
  const response = await fetch(`/api/app-storage?store=${encodeURIComponent(store)}&id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to read ${store}/${id}: ${response.status} ${response.statusText}`);
  }
  const value = (await response.json()) as T | null;
  return value ?? undefined;
}

async function backendSave(store: BackendStore, value: unknown): Promise<void> {
  const response = await fetch(`/api/app-storage?store=${encodeURIComponent(store)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save ${store}: ${response.status} ${response.statusText}`);
  }
}

async function backendDelete(store: BackendStore, id: string): Promise<void> {
  const response = await fetch(`/api/app-storage?store=${encodeURIComponent(store)}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete ${store}/${id}: ${response.status} ${response.statusText}`);
  }
}
