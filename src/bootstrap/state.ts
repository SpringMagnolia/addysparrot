import { invokeDesktop } from '../lib/desktopRuntime';

export type BootstrapStatus = 'not_started' | 'downloading' | 'installing' | 'verifying' | 'completed' | 'failed';

export interface BootstrapState {
  status: BootstrapStatus;
  step: string;
  startedAt: string;
  updatedAt: string;
  installedManifestVersion: number | null;
  error: string | null;
}

export async function getBootstrapStatus(): Promise<BootstrapState> {
  return invokeDesktop<BootstrapState>('bootstrap_status');
}

export async function startBootstrap(): Promise<BootstrapState> {
  return invokeDesktop<BootstrapState>('start_bootstrap');
}
