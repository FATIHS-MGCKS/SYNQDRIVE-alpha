import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installSecurityAccessMocks } from './security-access-fixtures';
import { seedMasterSidebarAuth } from './master-sidebar-v1-fixtures';
import {
  armCreateStepUpChallenge,
  armProfileStepUpChallenge,
  getRecordedCreateAttempts,
  getRecordedPatchAttempts,
  installSecurityAccessP3a3cMocks,
  PROFILE_USER_ID,
  resetP3a3cFixtureState,
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

async function completeMfaOtp(page: Page) {
  const dialog = page.getByTestId('mfa-step-up-dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const challenge = page.waitForResponse(
    (res) => res.url().includes('/account/mfa/challenge') && res.request().method() === 'POST' && res.ok(),
  );
  await dialog.getByRole('button', { name: /Wiederherstellungscode/i }).click({ force: true });
  await dialog.getByPlaceholder('XXXX-XXXX').fill('E2E-RCVR-CODE');
  await dialog.getByTestId('mfa-step-up-confirm').click();
  await challenge;
}

async function openProfileDrawer(page: Page) {
  await page.getByTestId('security-access-tab-users').click();
  await page.getByText('Fixture User A').click();
  const drawer = page.getByRole('dialog').last();
  await expect(drawer.getByTestId('global-profile-edit')).toBeVisible({ timeout: 15_000 });
  return drawer;
}

for (const vp of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`P3A.3C step-up create OTP retry (${vp.name} ${theme})`, async ({ page }) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.text().includes('STEP_UP') || msg.text().includes('IDENTITY')) {
          console.log(`[browser] ${msg.text()}`);
        }
      });
      resetP3a3cFixtureState();
      await seedMasterSidebarAuth(page, 'en');
      await installSecurityAccessP3a3cMocks(page);
      armCreateStepUpChallenge();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((th) => localStorage.setItem('synqdrive-theme-preference', th), theme);
      await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
      await openCreateForm(page);
      await page.getByTestId('create-user-email').fill('stepup@fixture.test');
      await page.getByTestId('create-user-first-name').fill('Step');
      const firstPost = page.waitForResponse(
        (res) => res.url().includes('/admin/security/users') && res.request().method() === 'POST',
      );
      let challengeOk = 0;
      page.on('response', (res) => {
        if (res.url().includes('/account/mfa/challenge') && res.request().method() === 'POST' && res.ok()) {
          challengeOk += 1;
        }
      });
      await page.getByTestId('create-user-submit').click();
      const first = await firstPost;
      expect(first.status()).toBe(403);
      await completeMfaOtp(page);
      expect(challengeOk).toBeGreaterThanOrEqual(1);
      await expect
        .poll(() => getRecordedCreateAttempts().length, { timeout: 20_000 })
        .toBe(2);
      await expect(page.getByTestId('create-user-result')).toBeVisible({ timeout: 20_000 });
      const attempts = getRecordedCreateAttempts();
      expect(attempts).toHaveLength(2);
      expect(attempts[0]?.headers['x-step-up-token']).toBeFalsy();
      expect(attempts[1]?.headers['x-step-up-token']).toBe('fixture-step-up-grant');
      expect((attempts[0]?.body as { idempotencyKey?: string }).idempotencyKey).toBe(
        (attempts[1]?.body as { idempotencyKey?: string }).idempotencyKey,
      );
      if (vp.name === 'desktop' && theme === 'light') {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'p3a3c-step-up-create-result.png') });
      }
    });
  }
}

for (const vp of viewports) {
  test(`P3A.3C step-up cancel denies mutation (${vp.name})`, async ({ page }) => {
    resetP3a3cFixtureState();
    await seedMasterSidebarAuth(page, 'en');
    await installSecurityAccessP3a3cMocks(page);
    armCreateStepUpChallenge();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
    await openCreateForm(page);
    await page.getByTestId('create-user-email').fill('cancel@fixture.test');
    await page.getByTestId('create-user-first-name').fill('Cancel');
    const firstPost = page.waitForResponse(
      (res) => res.url().includes('/admin/security/users') && res.request().method() === 'POST',
    );
    await page.getByTestId('create-user-submit').click();
    await firstPost;
    await expect(page.getByTestId('mfa-step-up-dialog')).toBeVisible();
    await page.getByTestId('mfa-step-up-cancel').click();
    await expect(page.getByTestId('mfa-step-up-dialog')).toBeHidden();
    expect(getRecordedCreateAttempts()).toHaveLength(1);
    await page.waitForTimeout(400);
    expect(getRecordedCreateAttempts()).toHaveLength(1);
  });
}

test('P3A.3C step-up profile patch with header retry (desktop)', async ({ page }) => {
  resetP3a3cFixtureState();
  await seedMasterSidebarAuth(page, 'en');
  await installSecurityAccessMocks(page);
  await installSecurityAccessP3a3cMocks(page);
  armProfileStepUpChallenge();
  await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });

  const drawer = await openProfileDrawer(page);
  await drawer.getByTestId('profile-first-name').fill('Patched');
  const firstPatch = page.waitForResponse(
    (res) => res.url().includes(PROFILE_USER_ID) && res.request().method() === 'PATCH',
  );
  await drawer.getByTestId('profile-save').click();
  expect((await firstPatch).status()).toBe(403);
  const retryPatch = page.waitForResponse(
    (res) =>
      res.url().includes(PROFILE_USER_ID) &&
      res.request().method() === 'PATCH' &&
      res.request().headers()['x-step-up-token'] === 'fixture-step-up-grant',
  );
  await completeMfaOtp(page);
  await retryPatch;
  const patches = getRecordedPatchAttempts();
  expect(patches).toHaveLength(2);
  expect(patches[1]?.headers['x-step-up-token']).toBe('fixture-step-up-grant');
  expect((patches[0]?.body as { idempotencyKey?: string }).idempotencyKey).toBe(
    (patches[1]?.body as { idempotencyKey?: string }).idempotencyKey,
  );
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'p3a3c-step-up-profile.png') });
});

test('P3A.3C close create dialog during step-up clears stale pending', async ({ page }) => {
  resetP3a3cFixtureState();
  await seedMasterSidebarAuth(page, 'en');
  await installSecurityAccessP3a3cMocks(page);
  armCreateStepUpChallenge();
  await page.goto('/master?view=security-access&securityAccess=users', { waitUntil: 'domcontentloaded' });
  await openCreateForm(page);
  await page.getByTestId('create-user-email').fill('stale@fixture.test');
  await page.getByTestId('create-user-first-name').fill('Stale');
  const firstPost = page.waitForResponse(
    (res) => res.url().includes('/admin/security/users') && res.request().method() === 'POST',
  );
  await page.getByTestId('create-user-submit').click();
  await firstPost;
  await expect(page.getByTestId('mfa-step-up-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('create-global-user-dialog')).toBeHidden({ timeout: 10_000 });
  await completeMfaOtp(page);
  await page.waitForTimeout(600);
  expect(getRecordedCreateAttempts()).toHaveLength(1);
});