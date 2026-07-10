import { defineConfig, devices } from '@playwright/test';

const mobileChromium = {
  ...devices['Pixel 5'],
  defaultBrowserType: 'chromium' as const,
};

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: '..',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-320',
      use: { ...mobileChromium, viewport: { width: 320, height: 568 } },
    },
    {
      name: 'mobile-375',
      use: { ...mobileChromium, viewport: { width: 375, height: 812 } },
    },
    {
      name: 'mobile-390',
      use: { ...mobileChromium, viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-430',
      use: { ...mobileChromium, viewport: { width: 430, height: 932 } },
    },
    {
      name: 'tablet-768',
      use: { ...mobileChromium, viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1280',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
