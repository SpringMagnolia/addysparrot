import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Maximize, Pause, Play } from 'lucide-react';
import { captureVideoElementFrame } from '../lib/videoThumbnail';
import { platformBridge } from '../lib/platformBridge';

export interface LocalVideoPlayerHandle {
  playSegment(start: number, playbackRate?: number, end?: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekTo(start: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  captureCurrentFrame?: () => string | null;
}

interface LocalVideoPlayerProps {
  video: Blob | string;
  title: string;
  onReady?: () => void;
  labels?: {
    controls: string;
    fullscreen: string;
    pause: string;
    play: string;
  };
}

export const LocalVideoPlayer = forwardRef<LocalVideoPlayerHandle, LocalVideoPlayerProps>(
  ({ video, title, onReady, labels }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const loopRangeRef = useRef<{ start: number; end: number; playbackRate: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const objectUrl = useMemo(() => (typeof video === 'string' ? video : URL.createObjectURL(video)), [video]);

    function logVideoEvent(event: string) {
      const player = videoRef.current;
      void platformBridge.logs.frontendEvent('local-video-player', {
        event,
        title,
        srcKind: typeof video === 'string' ? 'url' : 'blob',
        src: typeof video === 'string' ? video : 'blob',
        currentSrc: player?.currentSrc || null,
        readyState: player?.readyState ?? null,
        networkState: player?.networkState ?? null,
        currentTime: player?.currentTime ?? null,
        duration: Number.isFinite(player?.duration) ? player?.duration : null,
        errorCode: player?.error?.code ?? null,
        errorMessage: player?.error?.message ?? null,
      });
    }

    useEffect(
      () => () => {
        if (typeof video !== 'string') {
          URL.revokeObjectURL(objectUrl);
        }
      },
      [objectUrl, video],
    );

    function enableAudio() {
      const player = videoRef.current;
      if (!player) return;
      player.muted = false;
      player.volume = 1;
    }

    useImperativeHandle(ref, () => ({
      playSegment(start, playbackRate = 1, end) {
        const player = videoRef.current;
        if (!player) return;
        enableAudio();
        loopRangeRef.current =
          typeof end === 'number' && end > start
            ? { start, end, playbackRate }
            : null;
        player.playbackRate = playbackRate;
        player.currentTime = start;
        void player.play();
      },
      seekTo(start) {
        const player = videoRef.current;
        if (!player) return;
        player.currentTime = start;
      },
      play() {
        const player = videoRef.current;
        if (!player) return;
        enableAudio();
        if (loopRangeRef.current) {
          player.playbackRate = loopRangeRef.current.playbackRate;
        }
        void player.play();
      },
      pause() {
        loopRangeRef.current = null;
        videoRef.current?.pause();
      },
      togglePlay() {
        const player = videoRef.current;
        if (!player) return;
        if (player.paused) {
          enableAudio();
          void player.play();
        } else {
          loopRangeRef.current = null;
          player.pause();
        }
      },
      setPlaybackRate(rate) {
        const player = videoRef.current;
        if (!player) return;
        player.playbackRate = rate;
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? 0;
      },
      captureCurrentFrame() {
        const player = videoRef.current;
        if (!player) return null;
        return captureVideoElementFrame(player);
      },
    }));

    function keepInsideLoopRange() {
      const player = videoRef.current;
      const range = loopRangeRef.current;
      if (!player || !range || player.paused) return;

      if (player.currentTime >= range.end - 0.035 || player.currentTime < range.start - 0.25) {
        player.currentTime = range.start;
        player.playbackRate = range.playbackRate;
        void player.play();
      }
    }

    function toggleFullscreen() {
      const shell = videoRef.current?.closest('.player-shell');
      if (!shell) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void shell.requestFullscreen();
      }
    }

    function toggleLocalPlayback() {
      const player = videoRef.current;
      if (!player) return;

      if (player.paused) {
        enableAudio();
        void player.play();
      } else {
        loopRangeRef.current = null;
        player.pause();
      }
    }

    return (
      <div className="player-shell local-player-shell">
        <video
          ref={videoRef}
          className="local-video-player"
          src={objectUrl}
          title={title}
          playsInline
          muted={false}
          onLoadStart={() => logVideoEvent('loadstart')}
          onLoadedMetadata={() => {
            enableAudio();
            onReady?.();
            logVideoEvent('loadedmetadata');
          }}
          onLoadedData={() => logVideoEvent('loadeddata')}
          onCanPlay={() => logVideoEvent('canplay')}
          onWaiting={() => logVideoEvent('waiting')}
          onStalled={() => logVideoEvent('stalled')}
          onSuspend={() => logVideoEvent('suspend')}
          onError={() => logVideoEvent('error')}
          onPlay={() => {
            enableAudio();
            logVideoEvent('play');
            setIsPlaying(true);
          }}
          onPause={() => {
            logVideoEvent('pause');
            setIsPlaying(false);
          }}
          onEnded={() => {
            logVideoEvent('ended');
            setIsPlaying(false);
          }}
          onTimeUpdate={keepInsideLoopRange}
          onClick={toggleLocalPlayback}
        />
        <div className="local-player-controls" aria-label={labels?.controls ?? 'Local video controls'}>
          <button
            className="local-player-control-button local-player-play-toggle"
            type="button"
            title={isPlaying ? labels?.pause ?? 'Pause' : labels?.play ?? 'Play'}
            aria-label={isPlaying ? labels?.pause ?? 'Pause' : labels?.play ?? 'Play'}
            onClick={toggleLocalPlayback}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            className="local-player-control-button local-player-fullscreen"
            type="button"
            title={labels?.fullscreen ?? 'Fullscreen'}
            aria-label={labels?.fullscreen ?? 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            <Maximize size={18} />
          </button>
        </div>
      </div>
    );
  },
);

LocalVideoPlayer.displayName = 'LocalVideoPlayer';
