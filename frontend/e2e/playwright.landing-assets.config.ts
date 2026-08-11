import { defineConfig } from '@playwright/test';

/**
 * Dedicated config for capturing product screenshots used by the public marketing site.
 * Kept out of the main e2e run: single desktop viewport, retina scale, light theme.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /landing-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: '..',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
