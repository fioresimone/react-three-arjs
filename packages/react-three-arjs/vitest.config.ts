import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // The ARToolKit integration test loads WebAssembly.
    testTimeout: 30000,
  },
});
