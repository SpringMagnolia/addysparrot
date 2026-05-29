import { Captions, FolderOpen, Loader2, Plus, Search, Settings, Bookmark, Trash2, Video } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { parseYouTubeVideoId, createYouTubeWatchUrl, createThumbnailUrl } from '../lib/youtube';
import { useI18n } from '../lib/i18n/context';
import { platformBridge } from '../lib/platformBridge';
import { deleteTranscript, deleteVideo, getVideo, listVideos, saveVideo } from '../lib/storage';
import type { SavedVideo } from '../lib/types';
import { trimFileExtension, createLocalVideoId, fetchVideoMetadata } from '../lib/videoUtils';
import { formatVideoLibraryMeta } from '../lib/formatUtils';
import { findExpiredVideoIds } from '../lib/review';
import { deleteStudyProgress, listStudyProgress } from '../lib/storage';
import { navigate } from '../lib/router';

async function cleanupExpiredVideos(): Promise<void> {
  const [videos, studyProgressList] = await Promise.all([listVideos(), listStudyProgress()]);
  const expiredVideoIds = findExpiredVideoIds(videos, studyProgressList);
  if (expiredVideoIds.length === 0) return;

  await Promise.all(
    expiredVideoIds.flatMap((videoId) => [
      deleteVideo(videoId),
      deleteTranscript(videoId),
      deleteStudyProgress(videoId),
    ]),
  );
}

export function HomePage() {
  const { t } = useI18n();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [input, setInput] = useState('');
  const [addingVideo, setAddingVideo] = useState(false);
  const [importingVideo, setImportingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await cleanupExpiredVideos();
    setVideos(await listVideos());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const videoId = parseYouTubeVideoId(input);
    if (!videoId) {
      setError(t('invalidYoutubeUrl'));
      return;
    }

    setAddingVideo(true);
    const now = Date.now();
    const video: SavedVideo = {
      id: videoId,
      videoId,
      url: createYouTubeWatchUrl(videoId),
      title: `YouTube Video ${videoId}`,
      thumbnailUrl: createThumbnailUrl(videoId),
      createdAt: now,
      lastOpenedAt: now,
      sourceType: 'youtube',
      fileSize: 0,
      transcriptJob: {
        status: 'not_started',
        stage: 'video_added',
        segmentCount: 0,
        updatedAt: now,
      },
      updatedAt: now,
    };

    await saveVideo(video);
    setInput('');
    setAddingVideo(false);
    await refresh();
    navigate({ name: 'detail', id: videoId });

    void fetchVideoMetadata(videoId).then(async (metadata) => {
      if (!metadata?.title) return;
      const latest = (await getVideo(videoId)) ?? video;
      await saveVideo({
        ...latest,
        title: metadata.title,
        thumbnailUrl: metadata.thumbnailUrl ?? latest.thumbnailUrl,
      });
      await refresh();
    });
  }

  async function importLocalVideoFromDesktop() {
    setError(null);
    setImportingVideo(true);

    try {
      const imported = await platformBridge.video.selectLocal();
      if (!imported) {
        setImportingVideo(false);
        return;
      }

      const localId = createLocalVideoId(imported.fingerprint);
      const existingVideo = await getVideo(localId);
      const now = Date.now();
      const video: SavedVideo = {
        ...existingVideo,
        id: localId,
        videoId: localId,
        url: '',
        title: existingVideo?.title ?? (trimFileExtension(imported.fileName ?? t('localVideoDefaultTitle')) || t('localVideoDefaultTitle')),
        thumbnailUrl: imported.thumbnailUrl ?? existingVideo?.thumbnailUrl ?? '',
        createdAt: existingVideo?.createdAt ?? now,
        lastOpenedAt: now,
        sourceType: 'local',
        fileName: imported.fileName,
        fileSize: imported.fileSize,
        mimeType: imported.mimeType,
        contentFingerprint: imported.fingerprint,
        hasAudio: imported.hasAudio,
        audioCodec: imported.audioCodec,
        transcriptJob: existingVideo?.transcriptJob ?? {
          status: 'not_started',
          stage: 'media_import',
          segmentCount: 0,
          updatedAt: now,
        },
        updatedAt: now,
      };

      await saveVideo(video);
      await refresh();
      navigate({ name: 'detail', id: localId });
    } catch (err) {
      await refresh();
      setError(err instanceof Error ? err.message : t('localVideoImportFailed'));
    } finally {
      setImportingVideo(false);
    }
  }

  async function removeVideo(videoId: string) {
    const target = videos.find((v) => v.id === videoId);
    await Promise.all([
      deleteVideo(videoId),
      deleteTranscript(videoId),
      target?.sourceType === 'local' && target.contentFingerprint
        ? platformBridge.video.deleteLocalAssets(target.contentFingerprint)
        : Promise.resolve(),
    ]);
    await refresh();
  }

  return (
    <section className="page">
      <div className="page-heading home-heading">
        <div>
          <h1>{t('videoLibrary')}</h1>
          <p>{t('homeIntro')}</p>
        </div>
        <div className="heading-actions">
          <button className="nav-button" onClick={() => navigate({ name: 'settings' })}>
            <Settings size={18} />
            {t('settings')}
          </button>
          <button className="nav-button review-nav-entry" onClick={() => navigate({ name: 'review' })}>
            <Bookmark size={18} />
            {t('reviewEntry')}
          </button>
        </div>
      </div>

      <form className="add-panel" onSubmit={onSubmit}>
        <div className="input-row">
          <Search size={18} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
        <button className="primary-button" type="submit" disabled={addingVideo || importingVideo}>
          {addingVideo ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          {addingVideo ? t('addVideoLoading') : t('addVideo')}
        </button>
        <button className="secondary-button" type="button" disabled={importingVideo} onClick={importLocalVideoFromDesktop}>
          {importingVideo ? <Loader2 className="spin" size={18} /> : <FolderOpen size={18} />}
          {importingVideo ? t('selectLocalVideoLoading') : t('selectLocalVideo')}
        </button>
        {error && <p className="form-error">{error}</p>}
      </form>

      <div className="video-grid">
        {videos.map((video) => (
          <article className="video-card" key={video.id}>
            <button className="video-hit" onClick={() => navigate({ name: 'detail', id: video.videoId })}>
              {video.thumbnailUrl ? (
                <img src={video.thumbnailUrl} alt="" />
              ) : (
                <span className="local-video-thumb">
                  <Video size={34} />
                </span>
              )}
              <div className="video-card-body">
                <h2>{video.title}</h2>
                <div className="video-subtitle-row">
                  <p>{formatVideoLibraryMeta(video, t)}</p>
                </div>
              </div>
            </button>
            <button className="bare-icon-button danger video-delete" title={t('delete')} onClick={() => removeVideo(video.id)}>
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>

      {videos.length === 0 && (
        <div className="empty-state">
          <Captions size={28} />
          <p>{t('emptyLibrary')}</p>
        </div>
      )}
    </section>
  );
}
