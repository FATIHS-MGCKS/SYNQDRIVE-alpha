import { defineConfig } from '@playwright/test';

/**
 * QA config for the built public marketing site (landingpage/dist).
 *
 * Kept separate from the product e2e run: it never boots the app dev server and
 * only talks to the static file server that serves the built landing page.
 *
 * Point LANDING_QA_BASE_URL at https://synqdrive.eu to run the same suite as
 * post-deployment acceptance, with LANDING_QA_LABEL keeping its screenshots
 * separate from the local ones.
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
    baseURL: process.env.LANDING_QA_BASE_URL ?? 'http://127.0.0.1:4321',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
});
