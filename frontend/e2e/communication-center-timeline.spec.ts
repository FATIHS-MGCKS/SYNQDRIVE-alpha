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

  test('initial timeline scroll positions near newest activity', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop initial scroll');

    await openCommunicationCenter(page);
    await page.addStyleTag({
      content:
        '[data-testid="communication-timeline-scroll"] { max-height: 220px !important; height: 220px !important; }',
    });
    await selectFirstConversation(page);
    await expect(page.getByTestId('communication-timeline-scroll')).toBeVisible();

    const isNearBottom = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="communication-timeline-scroll"]') as HTMLElement | null;
      if (!el) return false;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    });
    expect(isNearBottom).toBe(true);
    await expect(page.getByText('Your pickup is scheduled for 14:00')).toBeVisible();
  });

  test('load older preserves viewport anchor', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop load older anchor');

    await openCommunicationCenter(page);
    await selectFirstConversation(page);
    await page.addStyleTag({
      content:
        '[data-testid="communication-timeline-scroll"] { max-height: 220px !important; height: 220px !important; }',
    });
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="communication-timeline-scroll"]') as HTMLElement | null;
      if (el) el.scrollTop = 0;
    });

    const before = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="communication-timeline-scroll"]') as HTMLElement | null;
      if (!el) return null;
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
    });
    expect(before).not.toBeNull();

    await page.getByTestId('communication-timeline-load-older').click();
    await expect(page.getByText('SMS inbound message')).toBeVisible();

    const after = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="communication-timeline-scroll"]') as HTMLElement | null;
      if (!el) return null;
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
    });
    expect(after).not.toBeNull();
    expect(after!.scrollHeight).toBeGreaterThan(before!.scrollHeight);
    expect(after!.scrollTop).toBeGreaterThan(0);
  });

  test('deep link with channel filter mismatch normalizes channel after detail load', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop channel mismatch');

    await openCommunicationCenter(page, {
      query: `view=communication-center&communicationChannel=sms&conversationId=${MOCK_CONVERSATION_ID}`,
    });

    await expect(page.getByTestId('communication-conversation-header-title')).toContainText('Max Mustermann');
    await expect(page.getByTestId('communication-conversation-header-meta')).toContainText(/WhatsApp/i);
    await expect(page).toHaveURL(/communicationChannel=whatsapp/);
  });

  test('detail 404 shows safe not-found with back action', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop detail 404');

    await openCommunicationCenter(page, {
      query: `view=communication-center&conversationId=${MOCK_CONVERSATION_ID}`,
      detailNotFound: true,
    });

    await expect(page.getByTestId('communication-conversation-not-found')).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to inbox/i })).toBeVisible();
    await expect(page.getByTestId('communication-timeline-error')).toHaveCount(0);
  });

  test('detail 403 shows safe permission UX without retry', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop detail 403');

    await openCommunicationCenter(page, {
      query: `view=communication-center&conversationId=${MOCK_CONVERSATION_ID}`,
      detailForbidden: true,
    });

    await expect(page.getByTestId('communication-detail-error')).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toHaveCount(0);
    await expect(page.getByText(/another tenant|forbidden resource/i)).toHaveCount(0);
  });

  test('detail success with timeline failure keeps header and retry surface', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop timeline failure');

    await openCommunicationCenter(page, { failTimelineInitial: true });
    await selectFirstConversation(page);

    await expect(page.getByTestId('communication-conversation-header-title')).toContainText('Max Mustermann');
    await expect(page.getByTestId('communication-timeline-error')).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });
});
