import { expect, test } from '@playwright/test';

import { openCommunicationCenter } from './communication-center-fixtures';

test.describe('Communication Center C8.4 settings', () => {
  test('settings tab opens overview with channel cards', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop settings overview');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings',
    });

    await expect(page.getByTestId('communication-settings-shell')).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview')).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview-whatsapp')).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview-voice')).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview-sms')).toBeVisible();
  });

  test('deep link opens voice settings section', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop settings deep link');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings&communicationSettings=voice',
    });

    await expect(page.getByTestId('communication-settings-shell')).toBeVisible();
    await expect(page.getByTestId('voice-agent-settings')).toBeVisible();
  });

  test('sms settings shows not configured without provider browser calls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop sms settings');

    const forbidden: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/sent\.dm|twilio|elevenlabs|graph\.facebook/i.test(url)) {
        forbidden.push(url);
      }
    });

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings&communicationSettings=sms',
    });

    await expect(page.getByTestId('sms-settings-panel')).toBeVisible();
    await expect(page.getByText(/Not configured/i)).toBeVisible();
    expect(forbidden).toEqual([]);
  });

  test('invalid settings section normalizes to overview', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop settings URL normalization');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings&communicationSettings=foo',
    });

    await expect(page).toHaveURL(/communicationSettings=overview/);
    await expect(page.getByTestId('communication-settings-overview')).toBeVisible();
  });
});
