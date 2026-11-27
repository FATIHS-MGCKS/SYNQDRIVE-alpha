import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openMasterSidebarView, seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import { installSecurityAccessMocks } from './security-access-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

test.describe.configure({ timeout: 90_000, mode: 'serial' });

test.describe('Master Security & Access responsive', () => {
  test.beforeEach(async ({ page }) => {
    await seedMasterSidebarAuth(page, 'en');
    await installSecurityAccessMocks(page);
  });

  for (const vp of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${vp.name} ${theme}`, async ({ page }) => {
        await openMasterSidebarView(page, 'security-access', {
          width: vp.width,
          height: vp.height,
          theme,
        });
        await expect(page.getByTestId('security-access-hub')).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `master-security-access-${vp.name}-${theme}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
});