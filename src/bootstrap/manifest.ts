import type { RuntimePlatform } from './platform';

export interface BootstrapManifest {
  schemaVersion: 1;
  bootstrapMode: 'eager';
  installOnFirstLaunch: boolean;
  platforms: RuntimePlatform[];
}
