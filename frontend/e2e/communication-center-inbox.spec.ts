import { expect, test } from '@playwright/test';

import {
  installCommunicationMocks,
  MOCK_CONVERSATION_ID,
  openCommunicationCenter,
} from './communication-center-fixtures';

test.describe('Communication Center C8.2 inbox integration', () => {
  test('renders canonical conversation rows from API at desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop inbox data contract');

    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await expect(page.getByText('Max Mustermann')).toBeVisible();
    await expect(page.getByText('Pickup reminder sent')).toBeVisible();
    await expect(page.getByText('BK-ABC123 · KS-AB 123')).toBeVisible();
  });

  test('channel filter requests WhatsApp channel only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop channel filter contract');

    await openCommunicationCenter(page);
    await page.getByTestId('communication-inbox-pane').locator('[data-channel="whatsapp"]').click();
    await expect(page).toHaveURL(/communicationChannel=whatsapp/);
    await expect(page.getByTestId('communication-inbox-pane').locator('[data-channel="whatsapp"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('search filters inbox via canonical API', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop search contract');

    await openCommunicationCenter(page);
    await page.getByTestId('communication-inbox-search').fill('Max');
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await expect(page.getByText('Max Mustermann')).toBeVisible();
  });

  test('unread filter toggles unreadOnly query', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop unread filter contract');

    await openCommunicationCenter(page);
    await page.getByTestId('communication-filter-unread').click();
    await expect(page).toHaveURL(/communicationUnread=true/);
    await expect(page.getByTestId('communication-filter-unread')).toHaveAttribute('aria-pressed', 'true');
  });

  test('load more appends next cursor page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop pagination contract');

    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await page.getByTestId('communication-inbox-load-more').click();
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
  });

  test('selecting row sets conversationId in URL', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop selection contract');

    await openCommunicationCenter(page);
    await page.getByText('Max Mustermann').click();
    await expect(page).toHaveURL(new RegExp(`conversationId=${MOCK_CONVERSATION_ID}`));
  });

  test('mobile selects conversation and preserves filters on back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile inbox selection contract');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&communicationUnread=true',
    });
    await page.getByText('Max Mustermann').click();
    await expect(page.getByTestId('communication-timeline-shell')).toBeVisible();
    await page.getByRole('button', { name: /Back to inbox|Zurück zum Posteingang/i }).click();
    await expect(page).toHaveURL(/communicationUnread=true/);
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
  });

  test('race: newer search result wins over slower stale response', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Search race contract');

    await page.addInitScript(() => {
      localStorage.setItem('synqdrive_token', 'communication-e2e-token');
      localStorage.setItem(
        'synqdrive_user',
        JSON.stringify({
          id: 'user-e2e',
          organizationId: 'org-task-e2e',
          membershipRole: 'ADMIN',
          permissions: { communication: { read: true, write: true, manage: true } },
        }),
      );
    });

    await installCommunicationMocks(page, { searchDelayMs: 1200 });
    await page.goto('/rental?view=communication-center', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('communication-center-view').waitFor({ state: 'visible' });

    const search = page.getByTestId('communication-inbox-search');
    await search.fill('A');
    await search.fill('AB');
    await expect(page.getByText('Max Mustermann')).toHaveCount(0);
  });
});
