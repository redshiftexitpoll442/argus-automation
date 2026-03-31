import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    // Run test files sequentially — clipboard and input tests
    // share OS state (clipboard, mouse position) and race when parallel.
    fileParallelism: false,
  },
});
