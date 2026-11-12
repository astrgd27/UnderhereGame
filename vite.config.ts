import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages serves
// the game from /UnderhereGame/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
