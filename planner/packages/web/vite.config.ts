// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The generated data files (ephemeris.bin, skylines.bin, validation records) are
// served straight from the repo's data/ folder: one copy, no duplicate to go stale.
export default defineConfig({
  plugins: [react()],
  publicDir: '../../data',
  base: './',
  build: { outDir: 'dist', sourcemap: true },
  // The Rover sim page shows a picture from ../rover-slam, outside planner/.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: ['../../..'] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
