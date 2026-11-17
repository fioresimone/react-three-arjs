import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  // three.js alone is ~700 KB; the demo does not split it.
  build: { chunkSizeWarningLimit: 1500 },
});
