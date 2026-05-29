import type { BootstrapProgressEvent } from './downloader';
import { getBootstrapStatus, startBootstrap, type BootstrapState } from './state';
import { invokeDesktop, isDesktopRuntime, onDesktopEvent } from '../lib/desktopRuntime';

export interface BootstrapLogSnapshot {
  text: string;
  truncated: boolean;
  updatedAt: number;
}

export function isBootstrapRuntime(): boolean {
  return isDesktopRuntime();
}

export async function readBootstrapState(): Promise<BootstrapState> {
  return getBootstrapStatus();
}

export async function runBootstrap(): Promise<BootstrapState> {
  return startBootstrap();
}

export async function openBootstrapLogs(): Promise<void> {
  await invokeDesktop('open_bootstrap_logs');
}

export async function readBootstrapLog(): Promise<BootstrapLogSnapshot> {
  return invokeDesktop<BootstrapLogSnapshot>('read_bootstrap_log');
}

export function onBootstrapProgress(callback: (event: BootstrapProgressEvent) => void): Promise<() => void> {
  return onDesktopEvent<BootstrapProgressEvent>('bootstrap-progress', callback);
}
