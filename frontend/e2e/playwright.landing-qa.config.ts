import { defineConfig } from '@playwright/test';

/**
 * QA config for the built public marketing site (landingpage/dist).
 *
 * Kept separate from the product e2e run: it never boots the app dev server and
 * only talks to the static file server that serves the built landing page.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /landing-page-qa\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4321',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
});
