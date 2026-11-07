import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // All test files share one database; run them serially.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
