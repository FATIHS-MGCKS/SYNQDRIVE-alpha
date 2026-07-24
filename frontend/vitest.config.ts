import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@synq/evaluations-metrics': path.resolve(__dirname, '../shared/evaluations-metrics'),
      '@synq/evaluations-periods': path.resolve(__dirname, '../shared/evaluations-periods'),
      '@synq/money': path.resolve(__dirname, '../shared/money'),
      '@synq/receivables': path.resolve(__dirname, '../shared/receivables'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/vitest.setup.ts'],
  },
});
