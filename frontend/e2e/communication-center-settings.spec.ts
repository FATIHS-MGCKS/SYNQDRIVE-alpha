import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  mockUserWithCommunication,
  openCommunicationCenter,
} from './communication-center-fixtures';

const mockUserReadOnlyCommunication = {
  ...mockUserWithCommunication,
  membershipRole: 'WORKER',
  permissions: {
    ...mockUserWithCommunication.permissions,
    communication: { read: true, write: false, manage: false },
    'voice-assistant': { read: false, write: false, manage: false },
  },
};

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

    const panel = page.getByTestId('sms-settings-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Not configured/i);
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

  test('read-only user cannot open settings via deep link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop read-only settings RBAC');

    await openCommunicationCenter(page, {
      user: mockUserReadOnlyCommunication,
      query: 'view=communication-center&communicationTab=settings&communicationSettings=sms',
    });

    await expect(page.getByTestId('communication-inbox-search')).toBeVisible();
    await expect(page.getByTestId('communication-settings-shell')).toHaveCount(0);
    await expect(page.getByTestId('communication-primary-tab-settings')).toHaveCount(0);
  });

  test('settings URL back and forward navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop settings history');

    await openCommunicationCenter(page, {
      query: 'view=communication-center',
    });

    await page.getByTestId('communication-primary-tab-settings').click();
    await expect(page.getByTestId('communication-settings-overview')).toBeVisible();

    await page.getByTestId('communication-settings-nav-whatsapp').click();
    await expect(page.getByTestId('whatsapp-business-settings')).toBeVisible();

    await page.getByTestId('communication-settings-nav-voice').click();
    await expect(page.getByTestId('voice-agent-settings')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('whatsapp-business-settings')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('communication-settings-overview')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('communication-inbox-search')).toBeVisible();
  });

  test('mobile settings navigation is usable at 390px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile settings layout');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings',
    });

    await expect(page.getByTestId('communication-settings-shell')).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview')).toBeVisible();
    await page.getByTestId('communication-settings-nav-sms').click();
    await expect(page.getByTestId('sms-settings-panel')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('tablet settings secondary nav at 1024px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-1024', 'Tablet settings layout');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings',
    });

    await expect(page.getByTestId('communication-settings-shell')).toBeVisible();
    await page.getByTestId('communication-settings-nav-whatsapp').click();
    await expect(page.getByTestId('whatsapp-business-settings')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('communication-inbox-workspace')).toHaveCount(0);
  });

  test('desktop settings overview accessibility landmarks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop settings accessibility');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationTab=settings',
    });

    await expect(page.getByRole('tablist', { name: /Communication Center sections/i })).toBeVisible();
    await expect(page.getByTestId('communication-settings-overview-whatsapp')).toContainText(
      /Connected|Configured|Not configured|Disabled/i,
    );
  });
});
