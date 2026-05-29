const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([^"&?/\\s]{11})/i;

export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  const match = value.match(YOUTUBE_ID_RE);
  if (match?.[1]) {
    return match[1];
  }

  try {
    const url = new URL(value);
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return v;
    }
  } catch {
    return null;
  }

  return null;
}

export function createYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function createThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function createEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    playsinline: '1',
  });
  if (window.location.origin.startsWith('http')) {
    params.set('origin', window.location.origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
