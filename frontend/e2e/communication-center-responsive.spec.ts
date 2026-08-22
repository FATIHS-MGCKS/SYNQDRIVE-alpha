import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  expectCommunicationNavVisible,
  openCommunicationCenter,
  openDashboardWithCommunicationNav,
  mockUserWithoutCommunication,
} from './communication-center-fixtures';

const SELECTED_CONVERSATION_QUERY =
  'view=communication-center&conversationId=conv-e2e-shell&communicationPane=conversation';

function channelFilter(page: import('@playwright/test').Page, channel: 'all' | 'whatsapp' | 'voice' | 'sms') {
  return page.getByTestId('communication-inbox-pane').locator(`[data-channel="${channel}"]`);
}

function closeContextSheet(page: import('@playwright/test').Page) {
  return page.keyboard.press('Escape');
}

test.describe('Communication Center C8.1 responsive shell', () => {
  test('default inbox/all at desktop empty selection', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop empty-state contract');

    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-center-view')).toBeVisible();
    await expect(channelFilter(page, 'all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-workspace-pane')).toBeVisible();
    await expect(page.getByText('Select a conversation')).toBeVisible();
    await expect(page.getByTestId('communication-context-pane')).toHaveCount(0);
    await expect(page.getByText('No conversations yet')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: 'playwright-report/communication-center-desktop-1440-empty.png',
      fullPage: true,
    });
  });

  test('desktop three-region layout with selected conversation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop three-region contract');

    await openCommunicationCenter(page, { query: SELECTED_CONVERSATION_QUERY });
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-workspace-pane')).toBeVisible();
    await expect(page.getByTestId('communication-context-pane')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: 'playwright-report/communication-center-desktop-1440-selected.png',
      fullPage: true,
    });
  });

  test('mobile inbox-only default at 390px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile inbox contract');

    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-workspace-pane')).toBeHidden();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: 'playwright-report/communication-center-mobile-390-inbox.png',
      fullPage: true,
    });
  });

  test('mobile selected conversation and back navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile conversation contract');

    await openCommunicationCenter(page, { query: SELECTED_CONVERSATION_QUERY });
    await expect(page.getByTestId('communication-timeline-shell')).toBeVisible();
    await expect(page.getByTestId('communication-inbox-pane')).toBeHidden();
    await page.screenshot({
      path: 'playwright-report/communication-center-mobile-390-selected.png',
      fullPage: true,
    });

    await page.getByRole('button', { name: /Back to inbox|Zurück zum Posteingang/i }).click();
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    expect(page.url()).not.toContain('communicationPane=conversation');
  });

  test('mobile context sheet opens and closes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Mobile context sheet contract');

    await openCommunicationCenter(page, {
      query: `${SELECTED_CONVERSATION_QUERY}`,
    });
    await page.getByRole('button', { name: /Open context panel|Kontextpanel öffnen/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.url()).toContain('communicationPane=context');
    await closeContextSheet(page);
    await expect(page.url()).toContain('communicationPane=conversation');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('tablet inbox + workspace without persistent context column', async ({ page }, testInfo) => {
    test.skip(
      !['tablet-1024', 'tablet-768'].includes(testInfo.project.name),
      'Tablet layout contract',
    );

    if (testInfo.project.name === 'tablet-768') {
      await openCommunicationCenter(page);
      await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
      await expect(page.getByTestId('communication-workspace-pane')).toBeHidden();
      return;
    }

    await openCommunicationCenter(page, { query: SELECTED_CONVERSATION_QUERY });
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-workspace-pane')).toBeVisible();
    await expect(page.getByTestId('communication-context-pane')).toHaveCount(0);
    await page.getByRole('button', { name: /Open context panel|Kontextpanel öffnen/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await closeContextSheet(page);
    await expect(page.getByTestId('communication-timeline-shell')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: 'playwright-report/communication-center-tablet-1024-selected.png',
      fullPage: true,
    });
  });

  test('channel filter URL sync and browser back', async ({ page }) => {
    await openCommunicationCenter(page);
    await channelFilter(page, 'whatsapp').click();
    await expect(page).toHaveURL(/communicationChannel=whatsapp/);
    await channelFilter(page, 'voice').click();
    await expect(page).toHaveURL(/communicationChannel=voice/);
    await page.goBack();
    await expect(page).toHaveURL(/communicationChannel=whatsapp/);
    await expect(channelFilter(page, 'whatsapp')).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(channelFilter(page, 'all')).toHaveAttribute('aria-pressed', 'true');
  });

  test('channel change clears selected conversation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop channel reset contract');

    await openCommunicationCenter(page, {
      query: 'view=communication-center&conversationId=conv-e2e-clear&communicationChannel=whatsapp',
    });
    await channelFilter(page, 'sms').click();
    await expect(page.url()).not.toContain('conversationId');
    await expect(page.getByTestId('communication-context-pane')).toHaveCount(0);
  });

  test('shows navigation with communication.read', async ({ page }) => {
    await openDashboardWithCommunicationNav(page);
    await expectCommunicationNavVisible(page, true);
  });

  test('hides navigation without communication.read', async ({ page }) => {
    await openDashboardWithCommunicationNav(page, mockUserWithoutCommunication);
    await expectCommunicationNavVisible(page, false);
  });

  test('denies direct route without communication.read', async ({ page }) => {
    await openCommunicationCenter(page, { user: mockUserWithoutCommunication });
    await expect(page.getByTestId('communication-center-access-denied')).toBeVisible();
    await expect(page.getByTestId('communication-center-view')).toHaveCount(0);
  });

  test('settings tab URL does not expose placeholder UI', async ({ page }) => {
    await openCommunicationCenter(page, { query: 'view=communication-center&communicationTab=settings' });
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-settings-shell')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveCount(0);
  });

  test('channel filters support keyboard activation', async ({ page }) => {
    await openCommunicationCenter(page);
    const whatsapp = channelFilter(page, 'whatsapp');
    await whatsapp.focus();
    await expect(whatsapp).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/communicationChannel=whatsapp/);
    await expect(channelFilter(page, 'whatsapp')).toHaveAttribute('aria-pressed', 'true');
    await channelFilter(page, 'voice').focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/communicationChannel=voice/);
  });

  test('does not render fake conversation rows', async ({ page }) => {
    await openCommunicationCenter(page);
    await expect(page.getByTestId('communication-inbox-pane')).toBeVisible();
    await expect(page.getByTestId('communication-inbox-list-shell')).toBeAttached();
    await expect(page.getByTestId('communication-conversation-row')).toHaveCount(0);
  });

  test('renders English copy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop EN copy contract');

    await openCommunicationCenter(page, { locale: 'en' });
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await expect(page.getByText('Select a conversation')).toBeVisible();
  });

  test('renders German copy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop DE copy contract');

    await openCommunicationCenter(page, { locale: 'de' });
    await expect(page.getByRole('heading', { name: 'Posteingang', exact: true })).toBeVisible();
    await expect(page.getByText('Konversation auswählen')).toBeVisible();
  });

  test('dashboard non-regression with communication nav additive', async ({ page }) => {
    await openDashboardWithCommunicationNav(page);
    await expect(page.getByTestId('dashboard-tasks-overview-panel')).toBeVisible();
    await expectCommunicationNavVisible(page, true);
    const navItems = page.getByRole('button', { name: /Communication Center/i });
    await expect(navItems).toHaveCount(1);
  });
});
