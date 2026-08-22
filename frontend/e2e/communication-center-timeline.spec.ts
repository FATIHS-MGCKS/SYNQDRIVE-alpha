import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  DEEP_LINK_CONVERSATION_ID,
  MOCK_CONVERSATION_ID,
  openCommunicationCenter,
} from './communication-center-fixtures';

const FORBIDDEN_PROVIDER_PATTERNS = [
  /\/whatsapp\//i,
  /\/sms\//i,
  /sent\.dm/i,
  /twilio/i,
  /elevenlabs/i,
];

async function selectFirstConversation(page: import('@playwright/test').Page) {
  await page.getByTestId('communication-conversation-row').first().click();
  await expect(page.getByTestId('communication-conversation-header-title')).toBeVisible();
}

test.describe('Communication Center C8.3 conversation timeline', () => {
  test('desktop shows header, timeline messages, and context panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop timeline contract');

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    await expect(page.getByTestId('communication-conversation-header-title')).toContainText('Max Mustermann');
    await expect(page.getByTestId('communication-timeline')).toBeVisible();
    await expect(page.getByTestId('communication-message-bubble')).toHaveCount(5);
    await expect(page.getByText('Hello, I need help with pickup')).toBeVisible();
    await expect(page.getByText('Your pickup is scheduled for 14:00')).toBeVisible();
    await expect(page.getByTestId('communication-context-pane')).toBeVisible();
    await expect(page.getByTestId('communication-context-sections')).toBeVisible();
    await expect(page.getByTestId('communication-context-sections').getByText('BK-ABC123')).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test('load older prepends timeline events', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop timeline pagination');

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    await page.getByTestId('communication-timeline-load-older').click();
    await expect(page.getByText('SMS inbound message')).toBeVisible();
    await expect(page.getByTestId('communication-message-bubble')).toHaveCount(6);
  });

  test('pagination failure retains events and retries', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop timeline pagination failure');

    await openCommunicationCenter(page, { failTimelinePage2: true });
    await selectFirstConversation(page);

    await page.getByTestId('communication-timeline-load-older').click();
    await expect(page.getByTestId('communication-timeline-pagination-error')).toBeVisible();
    await expect(page.getByText('Your pickup is scheduled for 14:00')).toBeVisible();
  });

  test('deep link loads conversation without inbox row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop deep link');

    await openCommunicationCenter(page, {
      query: `view=communication-center&conversationId=${DEEP_LINK_CONVERSATION_ID}`,
    });

    await expect(page.getByTestId('communication-conversation-header-title')).toContainText('Max Mustermann');
    await expect(page.getByTestId('communication-timeline')).toBeVisible();
  });

  test('tablet opens context sheet with canonical data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet-1024', 'Tablet context sheet');

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    await expect(page.getByTestId('communication-context-pane')).toHaveCount(0);
    await page.getByRole('button', { name: /Context/i }).click();
    await expect(page.getByTestId('communication-context-pane')).toBeVisible();
    await expect(page.getByTestId('communication-context-sections').getByText('Max Mustermann')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('communication-context-pane')).toHaveCount(0);
    await expect(page.getByTestId('communication-timeline')).toBeVisible();
  });

  test('mobile shows conversation detail with back navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile conversation detail');

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    await expect(page.getByTestId('communication-timeline')).toBeVisible();
    await expect(page.getByTestId('communication-message-bubble').first()).toBeVisible();
    await page.getByRole('button', { name: /Back to inbox/i }).click();
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test('voice conversation renders call lifecycle not chat bubbles', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile voice timeline');

    await openCommunicationCenter(page, {
      query: `view=communication-center&conversationId=00000000-0000-4000-8000-000000000102`,
    });

    await expect(page.getByTestId('communication-call-event')).toHaveCount(2);
    await expect(page.getByTestId('communication-message-bubble')).toHaveCount(0);
    await expect(page.getByText(/transcript/i)).toHaveCount(0);
  });

  test('media placeholders render without provider network requests', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop media placeholder');

    const forbiddenRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/organizations/') && url.includes('/communication/')) {
        if (FORBIDDEN_PROVIDER_PATTERNS.some((pattern) => pattern.test(url))) {
          forbiddenRequests.push(url);
        }
      }
    });

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    await expect(page.getByText('Photo caption')).toBeVisible();
    expect(forbiddenRequests).toEqual([]);
  });

  test('only canonical communication endpoints are called', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop network proof');

    const communicationUrls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/organizations/') && url.includes('/communication/')) {
        communicationUrls.push(url);
      }
    });

    await openCommunicationCenter(page);
    await selectFirstConversation(page);

    expect(communicationUrls.some((url) => url.includes(`/conversations/${MOCK_CONVERSATION_ID}`))).toBe(true);
    expect(communicationUrls.some((url) => url.includes('/events'))).toBe(true);
    expect(communicationUrls.every((url) => !FORBIDDEN_PROVIDER_PATTERNS.some((p) => p.test(url)))).toBe(true);
  });
});
