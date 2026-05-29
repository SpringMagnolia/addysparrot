/// <reference types="vite/client" />

declare global {
  const __DEBUG_FEATURES__: boolean;
  const __BUILD_CHANNEL__: 'debug' | 'release';
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: Record<string, (...args: unknown[]) => void>;
        },
      ) => YouTubePlayerInstance;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    electronShadowing?: import('./lib/desktopRuntime').ElectronShadowingApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  setVolume?(volume: number): void;
  unMute?(): void;
  getPlaybackRate(): number;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

export {};
