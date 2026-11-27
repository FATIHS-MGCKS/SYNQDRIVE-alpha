import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import { installSecurityAccessMocks, SA_FIXTURE_USER_A } from './security-access-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

test.describe.configure({ timeout: 120_000, mode: 'serial' });

function userNameInList(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 1024) {
    return page.locator('.hidden.lg\\:block').getByText(name).first();
  }
  return page.locator('.space-y-2.lg\\:hidden').getByText(name, { exact: true }).first();
}

async function gotoUsersDeepLink(
  page: Page,
  opts: { width: number; height: number; theme: 'light' | 'dark' },
) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.addInitScript((th) => {
    localStorage.setItem('synqdrive-theme-preference', th);
  }, opts.theme);
  const mfaStatus = page.waitForResponse(
    (res) => res.url().includes('/account/mfa/status') && res.ok(),
    { timeout: 60_000 },
  );
  await page.goto('/master?view=security-access&securityAccess=users', {
    waitUntil: 'domcontentloaded',
  });
  await mfaStatus;
  await expect(page).toHaveURL(/securityAccess=users/, { timeout: 15_000 });
  await expect(page.getByRole('main', { name: 'Master Admin' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('security-access-hub')).toBeVisible({ timeout: 60_000 });
  const usersTab = page.getByTestId('security-access-tab-users');
  await expect(usersTab).toBeVisible({ timeout: 15_000 });
  await usersTab.click();
  await expect(userNameInList(page, SA_FIXTURE_USER_A.name)).toBeVisible({ timeout: 30_000 });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  expect(overflow).toBe(false);
}

function usersListResponsePromise(
  page: Page,
  opts?: { search?: string; pageNum?: number },
) {
  return page.waitForResponse(
    (res) => {
      if (!res.url().includes('/api/v1/admin/security/users') || res.request().method() !== 'GET') {
        return false;
      }
      if (/\/users\/[^/?]+/.test(res.url())) return false;
      if (!res.ok()) return false;
      const parsed = new URL(res.url());
      if (opts?.pageNum != null && parsed.searchParams.get('page') !== String(opts.pageNum)) {
        return false;
      }
      if (opts?.search !== undefined) {
        const q = parsed.searchParams.get('search') ?? '';
        if (opts.search === '') return q === '';
        return q.toLowerCase().includes(opts.search.toLowerCase());
      }
      return true;
    },
    { timeout: 30_000 },
  );
}

async function exerciseUsersSurface(page: Page, vpName: string) {
  const search = page.getByPlaceholder('Search name or email…');
  const searchB = usersListResponsePromise(page, { search: 'Fixture User B' });
  await search.fill('Fixture User B');
  await searchB;
  await expect(userNameInList(page, 'Fixture User B')).toBeVisible({ timeout: 15_000 });
  const searchClear = usersListResponsePromise(page, { search: '' });
  await search.fill('');
  await searchClear;
  await expect(userNameInList(page, SA_FIXTURE_USER_A.name)).toBeVisible({ timeout: 15_000 });

  const page2 = usersListResponsePromise(page, { pageNum: 2 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page2;
  await expect(userNameInList(page, 'Fixture User B')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Back' }).click();

  const userDetail = page.waitForResponse(
    (res) => res.url().includes(`${SA_FIXTURE_USER_A.id}`) && res.ok(),
    { timeout: 30_000 },
  );
  await userNameInList(page, SA_FIXTURE_USER_A.name).click();
  await userDetail;
  const drawer = page.getByRole('dialog').first();
  await expect(drawer.getByText(SA_FIXTURE_USER_A.email)).toBeVisible({ timeout: 15_000 });
  await drawer.getByRole('button', { name: 'Reset MFA' }).click();
  const privilegeDialog = page.getByRole('dialog').last();
  await expect(privilegeDialog.getByLabel(/reason/i)).toBeVisible();
  await privilegeDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(privilegeDialog.getByLabel(/reason/i)).toBeHidden({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(drawer.getByText(SA_FIXTURE_USER_A.email)).toBeHidden({ timeout: 10_000 });

  await assertNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `master-security-access-users-flow-${vpName}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

test.describe('Master Security & Access responsive', () => {
  test.beforeEach(async ({ page }) => {
    await seedMasterSidebarAuth(page, 'en');
    await installSecurityAccessMocks(page);
  });

  for (const vp of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${vp.name} ${theme}`, async ({ page }) => {
        await gotoUsersDeepLink(page, { width: vp.width, height: vp.height, theme });
        await assertNoHorizontalOverflow(page);
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `master-security-access-${vp.name}-${theme}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        await exerciseUsersSurface(page, vp.name);
      });
    }
  }
});