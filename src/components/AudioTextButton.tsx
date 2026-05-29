import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { platformBridge } from '../lib/platformBridge';
import type { AudioAssetRef } from '../lib/types';

export type AudioTextButtonProps = {
  audio: AudioAssetRef;
  title: string;
  className?: string;
  stopPropagation?: boolean;
  children: ReactNode;
};

// Module-level mutable reference shared across all instances
let activeAudio: HTMLAudioElement | null = null;

export async function playAudio(audio: AudioAssetRef | undefined) {
  if (!audio) return;
  const resolved = await platformBridge.audio.resolveForPlayback(audio);
  const playableUrl = resolved.playableUrl;
  if (!playableUrl) return;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.src = '';
    activeAudio = null;
  }

  void platformBridge.logs.frontendEvent('audio-play-requested', {
    originalScheme: audio.remoteUrl ? getUrlScheme(audio.remoteUrl) : null,
    playableScheme: getUrlScheme(playableUrl),
    hasAudioAsset: Boolean(audio?.assetId || resolved.audio?.assetId),
  });
  const nextAudio = new Audio(playableUrl);
  activeAudio = nextAudio;
  nextAudio.addEventListener('ended', () => {
    if (activeAudio === nextAudio) {
      activeAudio = null;
    }
  });
  nextAudio.addEventListener('error', () => {
    void platformBridge.logs.frontendEvent('audio-play-error', {
      originalScheme: audio.remoteUrl ? getUrlScheme(audio.remoteUrl) : null,
      playableScheme: getUrlScheme(playableUrl),
      errorCode: nextAudio.error?.code ?? null,
      errorMessage: nextAudio.error?.message ?? null,
    });
    if (activeAudio === nextAudio) {
      activeAudio = null;
    }
  });
  void nextAudio.play().catch((error) => {
    void platformBridge.logs.frontendEvent('audio-play-rejected', {
      originalScheme: audio.remoteUrl ? getUrlScheme(audio.remoteUrl) : null,
      playableScheme: getUrlScheme(playableUrl),
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export function isPlayableAudio(audio: AudioAssetRef | undefined): audio is AudioAssetRef {
  return Boolean(audio && (audio.assetId || audio.remoteUrl));
}

export function getUrlScheme(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  return match?.[1] ?? 'relative';
}

export function AudioTextButton({ audio, title, className, stopPropagation = false, children }: AudioTextButtonProps) {
  return (
    <button
      className={className ? `audio-text-button ${className}` : 'audio-text-button'}
      title={title}
      type="button"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        void playAudio(audio);
      }}
      onKeyDown={preventAudioKeyboardPlayback}
      onKeyUp={preventAudioKeyboardPlayback}
    >
      {children}
    </button>
  );
}

export function preventAudioKeyboardPlayback(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;

  event.preventDefault();
  event.stopPropagation();
}
