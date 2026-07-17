import { expect, test } from '@playwright/test';

import {
  assertNoUnmaskedPhoneNumbers,
  assertNoVoiceSecretsInDom,
  openVoiceControlPlane,
} from './voice-fixtures';

test.describe('Voice AI Control Plane — staging E2E (mocked)', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Voice control plane specs run on desktop-1280 only');
  });

  test('1 — platform status renders provider health without secrets', async ({ page }) => {
    await openVoiceControlPlane(page, 'platform');
    await expect(page.getByText('Voice AI Control Plane')).toBeVisible();
    await expect(page.getByText('ElevenLabs')).toBeVisible();
    await expect(page.getByText('Twilio IE1')).toBeVisible();
    await assertNoVoiceSecretsInDom(page);
  });

  test('2 — organizations tab shows staging org with masked telephony', async ({ page }) => {
    await openVoiceControlPlane(page, 'organizations');
    await expect(page.getByText('Voice Staging E2E GmbH')).toBeVisible();
    await assertNoVoiceSecretsInDom(page);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\+491[0-9]{9,}/);
  });

  test('3 — phone numbers tab lists masked IE1 numbers', async ({ page }) => {
    await openVoiceControlPlane(page, 'phone-numbers');
    await expect(page.getByText('IE1')).toBeVisible();
    await assertNoUnmaskedPhoneNumbers(page);
  });

  test('4 — section navigation exposes all control plane tabs', async ({ page }) => {
    await openVoiceControlPlane(page);
    const tabbar = page.getByTestId('voice-control-plane-tabbar');
    await expect(tabbar.getByTestId('voice-control-plane-section-audit')).toBeVisible();
    await expect(tabbar.getByTestId('voice-control-plane-section-webhooks')).toBeVisible();
    await expect(tabbar.getByTestId('voice-control-plane-section-usage')).toBeVisible();
  });
});
