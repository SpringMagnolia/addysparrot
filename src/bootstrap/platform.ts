export type RuntimePlatform = 'darwin-arm64' | 'darwin-x64' | 'win32-x64' | 'linux-x64';

export function isSupportedRuntimePlatform(value: string): value is RuntimePlatform {
  return ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'].includes(value);
}
