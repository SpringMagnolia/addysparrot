export interface ElectronShadowingApi {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  onBootstrapProgress(callback: (event: unknown) => void): () => void;
  /**
   * Tell the Electron host that the renderer has mounted. The host arms a
   * 5 s watchdog when it promotes an OTA renderer; missing this heartbeat
   * triggers a rollback to the previous renderer + window reload. Old
   * clients without this IPC channel will silently ignore the call.
   */
  notifyOtaHeartbeat?(): void;
}

export type RuntimeKind = 'web' | 'electron';

declare global {
  interface Window {
    electronShadowing?: ElectronShadowingApi;
  }
}

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronShadowing);
}

export function getRuntimeKind(): RuntimeKind {
  return isElectronRuntime() ? 'electron' : 'web';
}

export function isDesktopRuntime(): boolean {
  return isElectronRuntime();
}

export function invokeDesktop<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isElectronRuntime()) {
    return Promise.reject(new Error(`Electron IPC is unavailable for command: ${command}`));
  }
  return window.electronShadowing!.invoke<T>(command, args ?? {});
}

export async function onDesktopEvent<T>(
  event: string,
  callback: (payload: T) => void,
): Promise<() => void> {
  if (!isElectronRuntime() || event !== 'bootstrap-progress') {
    return () => undefined;
  }

  return window.electronShadowing!.onBootstrapProgress((payload) => callback(payload as T));
}
