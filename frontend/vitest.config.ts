import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      '../shared/**/*.shared.spec.ts',
    ],
    setupFiles: ['./src/test/vitest.setup.ts'],
  },
});
