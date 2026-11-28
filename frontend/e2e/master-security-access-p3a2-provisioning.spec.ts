import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import { installSecurityAccessMocks } from './security-access-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

test.describe.configure({ timeout: 120_000 });

async function openCreateFormIdentityOnly(page: Page, captureFormShot = false) {
  await page.getByTestId('security-access-tab-users').click();
  await page.getByTestId('security-users-create').click();
  await expect(page.getByTestId('create-global-user-dialog')).toBeVisible();
  await page.getByTestId('create-user-email').fill('new-user@fixture.test');
  await page.getByTestId('create-user-first-name').fill('New');
  await page.getByTestId('create-user-last-name').fill('Fixture');
  if (captureFormShot) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'p3a2-create-form-light.png'),
      fullPage: false,
    });
  }
}

async function openCreateAndSubmitIdentityOnly(page: Page) {
  await openCreateFormIdentityOnly(page);
  const createPost = page.waitForResponse(
    (res) => res.url().includes('/admin/security/users') && res.request().method() === 'POST' && res.ok(),
    { timeout: 30_000 },
  );
  await page.getByTestId('create-user-submit').click();
  await createPost;
  await expect(page.getByTestId('create-user-result')).toBeVisible({ timeout: 15_000 });
}

for (const vp of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`P3A.2 provision + profile (${vp.name} ${theme})`, async ({ page }) => {
      await seedMasterSidebarAuth(page, 'en');
      await installSecurityAccessMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((th) => {
        localStorage.setItem('synqdrive-theme-preference', th);
      }, theme);
      await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('security-access-hub')).toBeVisible({ timeout: 60_000 });

      if (vp.name === 'desktop' && theme === 'light') {
        await openCreateFormIdentityOnly(page, true);
      } else {
        await openCreateFormIdentityOnly(page);
      }
      const createPost = page.waitForResponse(
        (res) => res.url().includes('/admin/security/users') && res.request().method() === 'POST' && res.ok(),
        { timeout: 30_000 },
      );
      await page.getByTestId('create-user-submit').click();
      await createPost;
      await expect(page.getByTestId('create-user-result')).toBeVisible({ timeout: 15_000 });
      if (vp.name === 'desktop' && theme === 'light') {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, 'p3a2-create-result-light.png'),
        });
      }

      const userDetail = page.waitForResponse(
        (res) =>
          res.url().includes('00000000-0000-4000-8000-0000000000c3') &&
          res.request().method() === 'GET' &&
          res.ok(),
        { timeout: 30_000 },
      );
      await page.getByTestId('create-user-open').click();
      await userDetail;

      const drawer = page.getByRole('dialog').last();
      await expect(drawer.getByTestId('global-profile-edit')).toBeVisible({ timeout: 15_000 });
      if (vp.name === 'desktop' && theme === 'light') {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, 'p3a2-profile-editor-light.png'),
          fullPage: false,
        });
      }

      const profilePatch = page.waitForResponse(
        (res) =>
          res.url().includes('00000000-0000-4000-8000-0000000000c3') &&
          res.request().method() === 'PATCH' &&
          res.ok(),
        { timeout: 30_000 },
      );
      await drawer.getByTestId('profile-first-name').fill('Edited');
      await drawer.getByTestId('profile-save').click();
      const patchRes = await profilePatch;
      const patchBody = patchRes.request().postDataJSON() as Record<string, unknown>;
      expect(patchBody).toMatchObject({ firstName: 'Edited' });
      expect(patchBody).not.toHaveProperty('language');
      expect(patchBody).not.toHaveProperty('timezone');
    });
  }
}