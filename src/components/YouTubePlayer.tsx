import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { YouTubePlayerInstance } from "../vite-env";
import { platformBridge } from "../lib/platformBridge";

export interface YouTubePlayerHandle {
  playSegment(start: number, playbackRate?: number, end?: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekTo(start: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  captureCurrentFrame?: () => string | null;
}

interface YouTubePlayerProps {
  videoId: string;
  loadingLabel?: string;
}

type PendingCommand =
  | {
      kind: "play-segment";
      start: number;
      playbackRate: number;
      end?: number;
      requestId: string;
      serial: number;
    }
  | { kind: "seek"; start: number; requestId: string; serial: number }
  | { kind: "play"; requestId: string; serial: number };

type PlaybackStage =
  | "idle"
  | "api-loading"
  | "player-ready"
  | "seek-issued"
  | "seek-verified"
  | "play-issued"
  | "buffering-slow"
  | "playing"
  | "failed";

type StageSnapshot = {
  stage: PlaybackStage;
  startedAt: number;
  requestId?: string;
  serial: number;
};

type YouTubeDiagnosticsWindow = Window & {
  __YOUTUBE_PLAYER_DIAGNOSTICS__?: Array<Record<string, unknown>>;
};

let apiPromise: Promise<void> | null = null;

const API_READY_TIMEOUT_MS = 10_000;
const SEEK_VERIFY_TIMEOUT_MS = 800;
const SEEK_VERIFY_INTERVAL_MS = 40;
const SEEK_VERIFY_TOLERANCE_SECONDS = 0.25;
const BUFFERING_SLOW_MS = 2_500;
const PLAYING_TIMEOUT_MS = 15_000;
const PLAYING_VERIFY_INTERVAL_MS = 80;
const DUPLICATE_TARGET_TOLERANCE_SECONDS = 0.01;
const ELECTRON_YOUTUBE_DIAGNOSTICS_KEY = "youtubePlaybackDiagnostics";

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    });
  }

  return apiPromise;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const YouTubePlayer = forwardRef<
  YouTubePlayerHandle,
  YouTubePlayerProps
>(({ videoId, loadingLabel = "Loading player..." }, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const loopRangeRef = useRef<{
    start: number;
    end: number;
    playbackRate: number;
  } | null>(null);
  const pendingCommandRef = useRef<PendingCommand | null>(null);
  const activePlaySegmentRef = useRef<Extract<
    PendingCommand,
    { kind: "play-segment" }
  > | null>(null);
  const stageRef = useRef<StageSnapshot>({
    stage: "idle",
    startedAt: Date.now(),
    serial: 0,
  });
  const commandSerialRef = useRef(0);
  const apiReadyRef = useRef(false);
  const apiReadyTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  const createCommandContext = () => {
    const serial = commandSerialRef.current + 1;
    commandSerialRef.current = serial;
    return {
      serial,
      requestId: `youtube_playback_${Date.now()}_${serial}`,
    };
  };

  const getPlayerStateName = (state: unknown): string => {
    if (!window.YT?.PlayerState || typeof state !== "number") return "unknown";
    const entries = Object.entries(window.YT.PlayerState);
    return (
      entries.find(([, value]) => value === state)?.[0].toLowerCase() ??
      `unknown:${state}`
    );
  };

  const currentPlayerSnapshot = () => {
    const player = playerRef.current;
    const rawState =
      player && typeof player.getPlayerState === "function"
        ? player.getPlayerState()
        : undefined;
    return {
      playerState: rawState,
      playerStateName: getPlayerStateName(rawState),
      currentTime:
        player && typeof player.getCurrentTime === "function"
          ? player.getCurrentTime()
          : undefined,
    };
  };

  const recordDiagnostic = (
    event: string,
    details: Record<string, unknown> = {},
  ) => {
    const payload = {
      event,
      videoId,
      ts: Date.now(),
      stage: stageRef.current.stage,
      stageStartedAt: stageRef.current.startedAt,
      stageElapsedMs: Date.now() - stageRef.current.startedAt,
      requestId: stageRef.current.requestId,
      serial: stageRef.current.serial,
      ...currentPlayerSnapshot(),
      ...details,
    };
    const diagnosticsWindow = window as YouTubeDiagnosticsWindow;
    diagnosticsWindow.__YOUTUBE_PLAYER_DIAGNOSTICS__ = [
      ...(diagnosticsWindow.__YOUTUBE_PLAYER_DIAGNOSTICS__ ?? []).slice(-120),
      payload,
    ];
    const mirrorDiagnostics =
      platformBridge.runtime() === "electron" ||
      window.localStorage.getItem(ELECTRON_YOUTUBE_DIAGNOSTICS_KEY) === "1";
    if (mirrorDiagnostics) {
      console.info("[youtube-player]", payload);
      void platformBridge.logs.frontendEvent("youtube-player", payload);
    }
  };

  const transitionTo = (
    stage: PlaybackStage,
    context: { requestId?: string; serial?: number } = {},
    details: Record<string, unknown> = {},
  ) => {
    const previous = stageRef.current;
    stageRef.current = {
      stage,
      startedAt: Date.now(),
      requestId: context.requestId ?? previous.requestId,
      serial: context.serial ?? previous.serial,
    };
    recordDiagnostic("state:transition", {
      from: previous.stage,
      to: stage,
      previousElapsedMs: Date.now() - previous.startedAt,
      ...details,
    });
    if (stage === "playing" || stage === "idle" || stage === "failed") {
      activePlaySegmentRef.current = null;
    }
  };

  const failStage = (
    reason: string,
    context: { requestId?: string; serial?: number } = {},
    details: Record<string, unknown> = {},
  ) => {
    transitionTo("failed", context, { reason, ...details });
  };

  const clearApiReadyTimer = () => {
    if (apiReadyTimerRef.current !== null) {
      window.clearTimeout(apiReadyTimerRef.current);
      apiReadyTimerRef.current = null;
    }
  };

  const startApiReadyTimer = (command: PendingCommand) => {
    clearApiReadyTimer();
    apiReadyTimerRef.current = window.setTimeout(() => {
      if (
        !apiReadyRef.current &&
        pendingCommandRef.current?.serial === command.serial
      ) {
        pendingCommandRef.current = null;
        failStage("api-ready-timeout", command, {
          timeoutMs: API_READY_TIMEOUT_MS,
          commandKind: command.kind,
        });
      }
    }, API_READY_TIMEOUT_MS);
  };

  const runPendingCommand = () => {
    const command = pendingCommandRef.current;
    if (!command || !playerRef.current) return;
    pendingCommandRef.current = null;
    clearApiReadyTimer();
    if (command.kind === "play-segment") {
      runPlaySegment(command.start, command.playbackRate, command.end, command);
    } else if (command.kind === "seek") {
      runSeekOnly(command.start, command);
    } else {
      runPlayOnly(command);
    }
  };

  const waitForSeekToApply = async (
    player: YouTubePlayerInstance,
    target: number,
    context: { requestId: string; serial: number },
    options: { updateStage?: boolean } = { updateStage: true },
  ) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SEEK_VERIFY_TIMEOUT_MS) {
      if (context.serial !== commandSerialRef.current) return false;
      const current =
        typeof player.getCurrentTime === "function"
          ? player.getCurrentTime()
          : target;
      if (Math.abs(current - target) <= SEEK_VERIFY_TOLERANCE_SECONDS) {
        const details = {
          target,
          current,
          elapsedMs: Date.now() - startedAt,
          toleranceSeconds: SEEK_VERIFY_TOLERANCE_SECONDS,
        };
        if (options.updateStage) {
          transitionTo("seek-verified", context, details);
        } else {
          recordDiagnostic("seek:verified", details);
        }
        return true;
      }
      await new Promise((resolve) =>
        window.setTimeout(resolve, SEEK_VERIFY_INTERVAL_MS),
      );
    }

    const details = {
      target,
      timeoutMs: SEEK_VERIFY_TIMEOUT_MS,
      toleranceSeconds: SEEK_VERIFY_TOLERANCE_SECONDS,
      current:
        typeof player.getCurrentTime === "function"
          ? player.getCurrentTime()
          : undefined,
    };
    if (options.updateStage) {
      failStage("seek-verify-timeout", context, details);
    } else {
      recordDiagnostic("seek:verify-timeout", details);
    }
    return false;
  };

  const waitForPlaying = async (
    player: YouTubePlayerInstance,
    context: { requestId: string; serial: number },
    target?: number,
  ) => {
    const startedAt = Date.now();
    let slowBufferingReported = false;
    while (Date.now() - startedAt < PLAYING_TIMEOUT_MS) {
      if (context.serial !== commandSerialRef.current) return false;
      const state =
        typeof player.getPlayerState === "function"
          ? player.getPlayerState()
          : undefined;
      if (state === window.YT?.PlayerState.PLAYING) {
        const currentTime =
          typeof player.getCurrentTime === "function"
            ? player.getCurrentTime()
            : undefined;
        transitionTo("playing", context, {
          elapsedMs: Date.now() - startedAt,
          target,
          startDriftSeconds:
            typeof target === "number" && typeof currentTime === "number"
              ? roundSeconds(currentTime - target)
              : undefined,
        });
        return true;
      }
      if (
        !slowBufferingReported &&
        Date.now() - startedAt >= BUFFERING_SLOW_MS
      ) {
        slowBufferingReported = true;
        transitionTo("buffering-slow", context, {
          elapsedMs: Date.now() - startedAt,
          slowThresholdMs: BUFFERING_SLOW_MS,
          target,
          ...currentPlayerSnapshot(),
        });
      }
      await new Promise((resolve) =>
        window.setTimeout(resolve, PLAYING_VERIFY_INTERVAL_MS),
      );
    }

    failStage("playing-timeout", context, {
      timeoutMs: PLAYING_TIMEOUT_MS,
      ...currentPlayerSnapshot(),
    });
    return false;
  };

  const preparePendingCommand = (command: PendingCommand) => {
    pendingCommandRef.current = command;
    if (command.kind === "play-segment") {
      activePlaySegmentRef.current = command;
    }
    transitionTo("api-loading", command, { commandKind: command.kind });
    startApiReadyTimer(command);
  };

  const isSameOptionalTime = (
    left: number | undefined,
    right: number | undefined,
  ) => {
    if (typeof left !== "number" && typeof right !== "number") return true;
    if (typeof left !== "number" || typeof right !== "number") return false;
    return Math.abs(left - right) <= DUPLICATE_TARGET_TOLERANCE_SECONDS;
  };

  const isDuplicatePlaySegment = (
    start: number,
    playbackRate: number,
    end?: number,
  ) => {
    const active = activePlaySegmentRef.current;
    const stage = stageRef.current.stage;
    if (
      !active ||
      ![
        "api-loading",
        "seek-issued",
        "seek-verified",
        "play-issued",
        "buffering-slow",
      ].includes(stage)
    ) {
      return false;
    }
    return (
      Math.abs(active.start - start) <= DUPLICATE_TARGET_TOLERANCE_SECONDS &&
      isSameOptionalTime(active.end, end) &&
      active.playbackRate === playbackRate
    );
  };

  const runSeekOnly = (start: number, context = createCommandContext()) => {
    const player = playerRef.current;
    if (!player || !apiReadyRef.current) {
      preparePendingCommand({ kind: "seek", start, ...context });
      return;
    }

    loopRangeRef.current = null;
    transitionTo("seek-issued", context, {
      target: start,
      commandKind: "seek",
    });
    player.seekTo(start, true);
    void waitForSeekToApply(player, start, context);
  };

  const runPlayOnly = (context = createCommandContext()) => {
    const player = playerRef.current;
    if (!player || !apiReadyRef.current) {
      preparePendingCommand({ kind: "play", ...context });
      return;
    }

    transitionTo("play-issued", context, { commandKind: "play" });
    player.playVideo();
    void waitForPlaying(player, context);
  };

  const runPlaySegment = (
    start: number,
    playbackRate = 1,
    end?: number,
    context?: { requestId: string; serial: number },
  ) => {
    if (!context && isDuplicatePlaySegment(start, playbackRate, end)) {
      const active = activePlaySegmentRef.current;
      recordDiagnostic("command:deduped", {
        commandKind: "play-segment",
        target: start,
        end,
        playbackRate,
        activeRequestId: active?.requestId,
        activeSerial: active?.serial,
      });
      return;
    }

    const commandContext = context ?? createCommandContext();
    const player = playerRef.current;
    if (!player || !apiReadyRef.current) {
      preparePendingCommand({
        kind: "play-segment",
        start,
        playbackRate,
        end,
        ...commandContext,
      });
      return;
    }

    activePlaySegmentRef.current = {
      kind: "play-segment",
      start,
      playbackRate,
      end,
      ...commandContext,
    };
    transitionTo("seek-issued", commandContext, {
      target: start,
      end,
      playbackRate,
      commandKind: "play-segment",
    });
    loopRangeRef.current =
      typeof end === "number" && end > start
        ? { start, end, playbackRate }
        : null;
    if (typeof player.unMute === "function") player.unMute();
    if (typeof player.setVolume === "function") player.setVolume(100);
    if (typeof player.setPlaybackRate === "function")
      player.setPlaybackRate(playbackRate);
    player.seekTo(start, true);
    transitionTo("play-issued", commandContext, {
      target: start,
      commandKind: "play-segment",
      playIssuedWithoutWaitingForSeekVerification: true,
    });
    player.playVideo();
    void waitForSeekToApply(player, start, commandContext, {
      updateStage: false,
    });
    void waitForPlaying(player, commandContext, start);
  };

  useImperativeHandle(ref, () => ({
    playSegment(start, playbackRate = 1, end) {
      runPlaySegment(start, playbackRate, end);
    },
    seekTo(start) {
      runSeekOnly(start);
    },
    play() {
      runPlayOnly();
    },
    pause() {
      commandSerialRef.current += 1;
      clearApiReadyTimer();
      pendingCommandRef.current = null;
      activePlaySegmentRef.current = null;
      loopRangeRef.current = null;
      const player = playerRef.current;
      if (typeof player?.pauseVideo === "function") player.pauseVideo();
      transitionTo(
        "idle",
        { serial: commandSerialRef.current },
        { commandKind: "pause" },
      );
    },
    togglePlay() {
      const player = playerRef.current;
      if (
        !player ||
        !window.YT?.PlayerState ||
        typeof player.getPlayerState !== "function" ||
        typeof player.playVideo !== "function" ||
        typeof player.pauseVideo !== "function"
      ) {
        return;
      }

      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
        commandSerialRef.current += 1;
        loopRangeRef.current = null;
        activePlaySegmentRef.current = null;
        player.pauseVideo();
        transitionTo(
          "idle",
          { serial: commandSerialRef.current },
          { commandKind: "toggle-pause" },
        );
      } else {
        runPlayOnly();
      }
    },
    setPlaybackRate(rate) {
      const player = playerRef.current;
      if (typeof player?.setPlaybackRate === "function")
        player.setPlaybackRate(rate);
    },
    getCurrentTime() {
      const player = playerRef.current;
      return typeof player?.getCurrentTime === "function"
        ? player.getCurrentTime()
        : 0;
    },
  }));

  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      const range = loopRangeRef.current;
      if (
        !player ||
        !range ||
        !window.YT?.PlayerState ||
        typeof player.getPlayerState !== "function"
      ) {
        return;
      }

      if (player.getPlayerState() !== window.YT.PlayerState.PLAYING) {
        return;
      }

      const currentTime =
        typeof player.getCurrentTime === "function"
          ? player.getCurrentTime()
          : 0;
      if (currentTime >= range.end - 0.05 || currentTime < range.start - 0.3) {
        runPlaySegment(range.start, range.playbackRate, range.end);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiReadyRef.current = false;
    clearApiReadyTimer();
    transitionTo(
      "api-loading",
      { serial: commandSerialRef.current },
      { reason: "video-id-change" },
    );
    setReady(false);
    setApiReady(false);

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player || !hostRef.current) {
        return;
      }

      playerRef.current?.destroy();
      const mount = document.createElement("div");
      mount.style.display = "block";
      mount.style.width = "100%";
      mount.style.height = "100%";
      hostRef.current.replaceChildren();
      hostRef.current.appendChild(mount);

      playerRef.current = new window.YT.Player(mount, {
        videoId,
        playerVars: {
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          ...(window.location.origin.startsWith("http")
            ? { origin: window.location.origin }
            : {}),
        },
        events: {
          onReady: () => {
            apiReadyRef.current = true;
            clearApiReadyTimer();
            setApiReady(true);
            setReady(true);
            transitionTo("player-ready", { serial: commandSerialRef.current });
            window.setTimeout(runPendingCommand, 0);
          },
          onStateChange: (event) => {
            const state =
              event && typeof event === "object" && "data" in event
                ? (event as { data?: unknown }).data
                : undefined;
            recordDiagnostic("iframe:state-change", {
              iframeState: state,
              iframeStateName: getPlayerStateName(state),
            });
          },
          onError: (event) => {
            const errorCode =
              event && typeof event === "object" && "data" in event
                ? (event as { data?: unknown }).data
                : undefined;
            failStage(
              "iframe-error",
              { serial: commandSerialRef.current },
              { errorCode },
            );
          },
        },
      });
    });

    return () => {
      cancelled = true;
      apiReadyRef.current = false;
      clearApiReadyTimer();
      pendingCommandRef.current = null;
      activePlaySegmentRef.current = null;
      commandSerialRef.current += 1;
      playerRef.current?.destroy();
      playerRef.current = null;
      hostRef.current?.replaceChildren();
    };
  }, [videoId]);

  return (
    <div className="player-shell youtube-player-shell">
      <div
        ref={hostRef}
        className={
          apiReady
            ? "player-frame player-api-frame"
            : "player-frame player-api-frame hidden"
        }
      />
      {!ready && <div className="player-loading">{loadingLabel}</div>}
    </div>
  );
});

YouTubePlayer.displayName = "YouTubePlayer";
