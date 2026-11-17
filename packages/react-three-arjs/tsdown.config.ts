import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', core: 'src/core.ts' },
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // Peer dependencies and the engine stay external.
  deps: {
    neverBundle: [
      /^react($|\/)/,
      /^react-dom($|\/)/,
      /^three($|\/)/,
      /^@react-three\//,
      /^@ar-js-org\//,
    ],
  },
  copy: [{ from: 'src/assets/*.{dat,hiro,kanji}', to: 'dist/assets' }],
  outputOptions: {
    // Components use hooks: mark the React entry for React Server Components bundlers.
    banner: (chunk) => (chunk.name === 'index' ? "'use client';" : ''),
  },
});
