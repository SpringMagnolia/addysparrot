export const VIDEO_THUMBNAIL_MAX_WIDTH = 640;
export const VIDEO_THUMBNAIL_QUALITY = 0.82;
export const VIDEO_THUMBNAIL_TIMEOUT_MS = 8000;

interface VideoThumbnailOptions {
  maxWidth?: number;
  quality?: number;
  timeoutMs?: number;
  seekTime?: number;
}

export function captureVideoElementFrame(
  video: HTMLVideoElement,
  options: Pick<VideoThumbnailOptions, 'maxWidth' | 'quality'> = {},
): string {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('The current video frame is not ready yet.');
  }

  const maxWidth = options.maxWidth ?? VIDEO_THUMBNAIL_MAX_WIDTH;
  const quality = options.quality ?? VIDEO_THUMBNAIL_QUALITY;
  const width = Math.min(video.videoWidth, maxWidth);
  const height = Math.round((video.videoHeight / video.videoWidth) * width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot create a video thumbnail.');
  }

  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function createVideoFileThumbnail(
  file: File,
  options: VideoThumbnailOptions = {},
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await createVideoSourceThumbnail(objectUrl, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createVideoSourceThumbnail(source: string, options: VideoThumbnailOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let timeoutId: number | undefined;
    let settled = false;
    let waitingForSeek = false;

    const finish = (thumbnailUrl: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();

      if (error) {
        reject(error);
      } else {
        resolve(thumbnailUrl);
      }
    };

    const capture = () => {
      try {
        finish(captureVideoElementFrame(video, options));
      } catch (error) {
        finish('', error);
      }
    };

    timeoutId = window.setTimeout(() => {
      finish('', new Error('Timed out while reading the local video frame.'));
    }, options.timeoutMs ?? VIDEO_THUMBNAIL_TIMEOUT_MS);

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const hasFiniteDuration = Number.isFinite(video.duration) && video.duration > 0;
      const fallbackTime = hasFiniteDuration ? video.duration * 0.08 : 0.5;
      const requestedSeekTime = options.seekTime ?? Math.min(0.5, fallbackTime);
      const maxSeekTime = hasFiniteDuration ? Math.max(video.duration - 0.05, 0) : requestedSeekTime;
      const seekTime = Math.max(0, Math.min(requestedSeekTime, maxSeekTime));
      if (seekTime <= 0) {
        capture();
        return;
      }

      waitingForSeek = true;
      video.onseeked = capture;
      try {
        video.currentTime = seekTime;
      } catch {
        waitingForSeek = false;
        capture();
      }
    };
    video.onloadeddata = () => {
      if (!waitingForSeek) {
        capture();
      }
    };
    video.onerror = () => {
      finish('', new Error('Failed to read the local video frame.'));
    };
    video.src = source;
    video.load();
  });
}
