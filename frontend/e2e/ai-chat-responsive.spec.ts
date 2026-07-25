import { expect, test } from '@playwright/test';

import {
  assertChatInputReachable,
  assertCompactSummaryFullyVisible,
  assertMessagesScrollRegion,
  assertNoHorizontalOverflow,
  openAiChatPage,
} from './ai-chat-fixtures';

const mobileWidths = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-360', width: 360, height: 640 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
] as const;

test.describe('AI Chat — responsive layout', () => {
  test.beforeEach(({ }, testInfo) => {
    const allowed = new Set([
      'mobile-320',
      'mobile-360',
      'mobile-375',
      'mobile-390',
      'mobile-430',
      'tablet-768',
      'landscape-375',
      'desktop-1280',
      'desktop-1920',
    ]);
    test.skip(!allowed.has(testInfo.project.name), 'Responsive specs use dedicated viewport projects');
  });

  for (const vp of mobileWidths) {
    test(`${vp.name}: welcome screen fits without horizontal overflow`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== vp.name, `Runs on ${vp.name} project only`);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openAiChatPage(page);
      await assertNoHorizontalOverflow(page);
      await expect(page.getByTestId('ai-assistant-root')).toBeVisible();
      await expect(page.getByTestId('ai-chat-compose')).toBeVisible();
      await expect(page.locator('aside[aria-label="Chat-Sitzungsinfo"]')).toBeHidden();
      await assertChatInputReachable(page);
    });
  }

  test('long structured answers: no overflow, scroll region, input reachable', async ({ page }, testInfo) => {
    test.skip(
      !['mobile-375', 'mobile-390', 'mobile-430', 'tablet-768', 'desktop-1280'].includes(testInfo.project.name),
      'Runs on selected viewport projects',
    );
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 375, height: 640 });
    await openAiChatPage(page, { withLongHistory: true });
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId('ai-chat-messages')).toBeVisible();
    await assertMessagesScrollRegion(page);
    await assertCompactSummaryFullyVisible(page, 'HEALTH_SUMMARY');
    await assertCompactSummaryFullyVisible(page, 'OVERDUE_EXPLANATION');
    await assertChatInputReachable(page);
    await expect(page.getByTestId('ai-chat-input')).toBeEditable();
  });

  test('desktop: session sidebar visible, chat column uses width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Runs on desktop-1280 project only');
    await openAiChatPage(page, { withLongHistory: true });
    await assertNoHorizontalOverflow(page);
    await expect(page.locator('aside[aria-label="Chat-Sitzungsinfo"]')).toBeVisible();
    const compose = page.getByTestId('ai-chat-compose');
    const box = await compose.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeGreaterThan(700);
    expect(box!.width).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
  });

  test('landscape mobile: input and messages remain usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'landscape-375', 'Runs on landscape-375 project only');
    await openAiChatPage(page, { withLongHistory: true });
    await assertNoHorizontalOverflow(page);
    await assertChatInputReachable(page);
    await assertCompactSummaryFullyVisible(page, 'OVERDUE_EXPLANATION');
  });
});
