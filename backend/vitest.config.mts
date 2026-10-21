import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.ts', 'tests/integration/**/*.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Integration suites share one mongod; run files sequentially for deterministic state.
    fileParallelism: false,
  },
});
