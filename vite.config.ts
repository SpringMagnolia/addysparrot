import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildChannel = process.env.ADDYSPARROT_BUILD_CHANNEL ?? 'debug';
const isRelease = buildChannel === 'release';

export default defineConfig({
  plugins: [react()],
  define: {
    __DEBUG_FEATURES__: JSON.stringify(!isRelease),
    __BUILD_CHANNEL__: JSON.stringify(buildChannel),
  },
});
