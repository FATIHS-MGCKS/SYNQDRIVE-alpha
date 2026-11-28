import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import {
  armCreateStepUpChallenge,
  getRecordedCreateAttempts,
  installSecurityAccessP3a3cMocks,
} from './security-access-p3a3c-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

test.describe.configure({ timeout: 120_000 });

async function openCreateForm(page: Page) {
  await page.getByTestId('security-access-tab-users').click();
  await page.getByTestId('security-users-create').click();
  await expect(page.getByTestId('create-global-user-dialog')).toBeVisible();
}

for (const vp of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`P3A.3C org invite + credential (${vp.name} ${theme})`, async ({ page }) => {
      await seedMasterSidebarAuth(page, 'en');
      await installSecurityAccessP3a3cMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((th) => localStorage.setItem('synqdrive-theme-preference', th), theme);
      await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
      await openCreateForm(page);
      if (vp.name === 'desktop' && theme === 'light') {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'p3a3c-create-form-before-submit.png') });
      }
      await page.getByTestId('create-user-email').fill('invite@fixture.test');
      await page.getByTestId('create-user-first-name').fill('Invite');
      await page.getByTestId('create-user-last-name').fill('Fixture');
      await page.getByTestId('create-user-organization').selectOption('org-fixture-1');
      await expect(page.getByRole('radio', { name: /Invite by email/i })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('radio', { name: /Invite by email/i }).check();
      const post = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/admin/security/users'));
      await page.getByTestId('create-user-submit').click();
      const response = await post;
      const reqBody = response.request().postDataJSON() as {
        idempotencyKey?: string;
        initialMembership?: { inviteByEmail?: boolean; organizationRoleId?: string };
      };
      expect(reqBody.initialMembership?.inviteByEmail).toBe(true);
      expect(reqBody.initialMembership?.organizationId).toBe('org-fixture-1');
      expect(reqBody.idempotencyKey).toBeTruthy();
      await expect(page.getByTestId('create-user-result')).toBeVisible();
      if (vp.name === 'desktop' && theme === 'light') {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'p3a3c-org-invite-result.png') });
      }
    });
  }
}

test('P3A.3C credential setup payload (desktop light)', async ({ page }) => {
  await seedMasterSidebarAuth(page, 'en');
  await installSecurityAccessP3a3cMocks(page);
  await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
  await openCreateForm(page);
  await page.getByTestId('create-user-email').fill('cred@fixture.test');
  await page.getByTestId('create-user-first-name').fill('Cred');
  await page.getByTestId('create-user-organization').selectOption('org-fixture-1');
  await expect(page.getByRole('radio', { name: /Credential setup/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: /Credential setup/i }).check();
  const post = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/admin/security/users'));
  await page.getByTestId('create-user-submit').click();
  await post;
  const body = getRecordedCreateAttempts().at(-1)?.body;
  expect(body?.sendCredentialSetup).toBe(true);
});

test('P3A.3C ambiguous create retry preserves operation key', async ({ page }) => {
  await seedMasterSidebarAuth(page, 'en');
  await installSecurityAccessP3a3cMocks(page);
  const { armTransientCreateFailure } = await import('./security-access-p3a3c-fixtures');
  armTransientCreateFailure();
  await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
  await openCreateForm(page);
  await page.getByTestId('create-user-email').fill('retry@fixture.test');
  await page.getByTestId('create-user-first-name').fill('Re');
  await page.getByTestId('create-user-submit').click();
  await expect(page.getByRole('button', { name: /same operation/i })).toBeVisible();
  const retryPost = page.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/admin/security/users'));
  await page.getByRole('button', { name: /same operation/i }).click();
  await retryPost;
  const keys = getRecordedCreateAttempts().map((a) => (a.body as { idempotencyKey?: string }).idempotencyKey);
  expect(keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
});
