import path from 'node:path';
import { expect, test } from '@playwright/test';
import { seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import { installSecurityAccessMocks } from './security-access-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts';

for (const theme of ['light', 'dark'] as const) {
  test(`P3A.2 create flow (${theme})`, async ({ page }) => {
    await seedMasterSidebarAuth(page);
    await installSecurityAccessMocks(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((th) => {
      localStorage.setItem('synqdrive-theme-preference', th);
    }, theme);
    await page.goto('/master?view=security-access&securityAccess=users');
    await page.getByTestId('security-access-tab-users').click();
    await page.getByRole('button', { name: /Create user|Benutzer anlegen/i }).click();
    await expect(page.getByTestId('create-global-user-dialog')).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `p3a2-create-form-${theme}.png`),
      fullPage: false,
    });
    await page.getByTestId('create-user-email').fill('new-user@fixture.test');
    await page.getByTestId('create-user-first-name').fill('New');
    await page.getByTestId('create-user-last-name').fill('Fixture');
    await page.getByTestId('create-user-submit').click();
    await expect(page.getByTestId('create-user-result')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `p3a2-create-result-${theme}.png`),
    });
  });
}