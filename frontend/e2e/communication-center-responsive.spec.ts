import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  expectCommunicationNavVisible,
  openCommunicationCenter,
  openDashboardWithCommunicationNav,
  mockUserWithoutCommunication,
} from './communication-center-fixtures';

const ARTIFACT_VIEWPORTS = ['mobile-390', 'tablet-768', 'desktop-1280'] as const;

test.describe('Communication Center C8.1 responsive shell', () => {
  test('renders shell with inbox defaults and channel filters', async ({ page }, testInfo) => {
    await openCommunicationCenter(page);

    await expect(page.getByTestId('communication-center-view')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Inbox' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1024) {
      await expect(page.getByTestId('communication-workspace-pane')).toBeVisible();
      await expect(page.getByText('Select a conversation')).toBeVisible();
    } else {
      await expect(page.getByText('No conversations yet.')).toBeVisible();
    }
    await assertNoHorizontalOverflow(page);

    if (ARTIFACT_VIEWPORTS.includes(testInfo.project.name as (typeof ARTIFACT_VIEWPORTS)[number])) {
      await page.screenshot({
        path: `playwright-report/communication-center-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  });

  test('shows navigation with communication.read', async ({ page }) => {
    await openDashboardWithCommunicationNav(page);
    await expectCommunicationNavVisible(page, true);
  });

  test('denies direct route without communication.read', async ({ page }) => {
    await openCommunicationCenter(page, { user: mockUserWithoutCommunication });
    await expect(page.getByTestId('communication-center-access-denied')).toBeVisible();
    await expect(page.getByTestId('communication-center-view')).toHaveCount(0);
  });

  test('mobile conversation shell supports back navigation', async ({ page }) => {
    await openCommunicationCenter(page, {
      query:
        'view=communication-center&conversationId=conv-e2e-shell&communicationPane=conversation',
    });

    await expect(page.getByTestId('communication-timeline-shell')).toBeVisible();
    const backButton = page.getByRole('button', { name: /Back to inbox|Zurück zum Posteingang/i });
    if (await backButton.isVisible()) {
      await backButton.click();
      await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    }
  });
});
