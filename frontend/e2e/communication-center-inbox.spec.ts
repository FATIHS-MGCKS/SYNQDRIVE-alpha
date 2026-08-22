import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  installCommunicationMocks,
  MOCK_CONVERSATION_ID,
  openCommunicationCenter,
} from './communication-center-fixtures';

const FORBIDDEN_PROVIDER_PATTERNS = [
  /\/whatsapp\//i,
  /\/sms\//i,
  /\/voice\//i,
  /sent\.dm/i,
  /twilio/i,
  /elevenlabs/i,
];

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
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(2);
    await expect(page.getByText('Max Mustermann')).toHaveCount(1);
    await expect(page.getByText('Voice Customer')).toBeVisible();
  });

  test('pagination failure retains page 1 and retries page 2', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop pagination failure contract');

    await openCommunicationCenter(page, { failPage2: true });
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await page.getByTestId('communication-inbox-load-more').click();
    await expect(page.getByTestId('communication-inbox-pagination-error')).toBeVisible();
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await expect(page.getByTestId('communication-inbox-error')).toHaveCount(0);

    await page.unroute(`**/organizations/**/communication/**`);
    await installCommunicationMocks(page, { failPage2: false });
    await page.getByRole('button', { name: /Retry loading more/i }).click();
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(2);
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
    await expect(page.getByTestId('communication-timeline')).toBeVisible();
    await page.getByRole('button', { name: /Back to inbox|Zurück zum Posteingang/i }).click();
    await expect(page).toHaveURL(/communicationUnread=true/);
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('race: newer AB search result wins over slower A response', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Search race contract');

    await openCommunicationCenter(page, { searchRace: true });
    const search = page.getByTestId('communication-inbox-search');

    const responseA = page.waitForResponse((response) => {
      const url = response.url();
      return (
        url.includes('/communication/conversations') &&
        new URL(url).searchParams.get('search') === 'A'
      );
    });

    await search.fill('A');
    await responseA;
    await search.fill('AB');

    await expect(page.getByTestId('communication-conversation-row').filter({ hasText: 'Result AB' })).toHaveCount(1);
    await expect(page.getByText('Result A', { exact: true })).toHaveCount(0);
  });

  test('channel switch hides WhatsApp rows while SMS response is pending', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Filter switch isolation contract');

    await openCommunicationCenter(page, { smsDelayMs: 900 });
    await expect(page.getByText('Max Mustermann')).toBeVisible();
    await page.getByTestId('communication-inbox-pane').locator('[data-channel="sms"]').click();
    await expect(page.getByText('Max Mustermann')).toHaveCount(0);
    await expect(page.getByText('SMS Customer')).toBeVisible();
  });

  test('uses only canonical communication conversation routes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'No provider API contract');

    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/organizations/') && url.includes('/communication/')) {
        requestedUrls.push(url);
      }
    });

    await openCommunicationCenter(page);
    await page.getByTestId('communication-inbox-search').fill('Max');
    await page.getByTestId('communication-filter-unread').click();
    await page.getByTestId('communication-inbox-load-more').click().catch(() => undefined);

    for (const url of requestedUrls) {
      expect(url).toMatch(/\/communication\/conversations/);
      expect(FORBIDDEN_PROVIDER_PATTERNS.some((pattern) => pattern.test(url))).toBe(false);
    }
  });

  test('tablet inbox remains usable with API rows', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-1024', 'Tablet responsive contract');

    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(1);
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('desktop supports selected row and load more', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop responsive contract');

    await openCommunicationCenter(page);
    await page.getByText('Max Mustermann').click();
    await expect(page).toHaveURL(new RegExp(`conversationId=${MOCK_CONVERSATION_ID}`));
    await page.getByTestId('communication-inbox-load-more').click();
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(2);
  });
});
