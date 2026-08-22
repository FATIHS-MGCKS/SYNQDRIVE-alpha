/**
 * Playwright fixtures for Communication Center shell + inbox E2E.
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow, installTaskMocks, mockUser, TEST_ORG_ID } from './task-fixtures';

export { assertNoHorizontalOverflow, TEST_ORG_ID };

export const MOCK_CONVERSATION_ID = '00000000-0000-4000-8000-000000000101';

const mockConversations = [
  {
    id: MOCK_CONVERSATION_ID,
    channel: 'WHATSAPP',
    status: 'AI_ACTIVE',
    unreadCount: 2,
    lastActivityAt: '2026-08-22T10:30:00.000Z',
    displayLabel: 'Max Mustermann',
    lastMessagePreview: 'Pickup reminder sent',
    customer: { id: 'cust-1', displayName: 'Max Mustermann' },
    booking: { id: 'book-1', reference: 'BK-ABC123' },
    vehicle: { id: 'veh-1', displayLabel: 'KS-AB 123' },
    station: null,
    assignedUser: null,
    assignedAgent: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    channel: 'VOICE',
    status: 'HUMAN_REQUIRED',
    unreadCount: 0,
    lastActivityAt: '2026-08-22T09:15:00.000Z',
    displayLabel: 'Unknown contact',
    lastMessagePreview: null,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: { id: 'user-1', displayName: 'Ops User' },
    assignedAgent: null,
  },
];

export async function installCommunicationMocks(
  page: Page,
  options?: { empty?: boolean; searchDelayMs?: number },
) {
  await page.route(`**/organizations/${TEST_ORG_ID}/communication/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();

    if (url.includes('/communication/conversations/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalUnreadMessages: options?.empty ? 0 : 2,
          unreadConversations: options?.empty ? 0 : 1,
          unassigned: options?.empty ? 0 : 1,
          requiresAttention: options?.empty ? 0 : 1,
          byChannel: options?.empty ? {} : { WHATSAPP: 1, VOICE: 1 },
        }),
      });
    }

    if (url.includes('/communication/conversations')) {
      if (options?.searchDelayMs && url.includes('search=')) {
        await new Promise((resolve) => setTimeout(resolve, options.searchDelayMs));
      }

      const search = new URL(url).searchParams.get('search') ?? '';
      const channel = new URL(url).searchParams.get('channel');
      const unreadOnly = new URL(url).searchParams.get('unreadOnly') === 'true';
      const cursor = new URL(url).searchParams.get('cursor');

      let items = options?.empty ? [] : [...mockConversations];
      if (channel) items = items.filter((row) => row.channel === channel);
      if (unreadOnly) items = items.filter((row) => row.unreadCount > 0);
      if (search) {
        items = items.filter((row) =>
          row.displayLabel.toLowerCase().includes(search.toLowerCase()),
        );
      }

      if (cursor === 'page-2') {
        items = [];
      } else if (!options?.empty && !cursor && items.length > 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: items.slice(0, 1),
            nextCursor: 'page-2',
            hasMore: items.length > 1,
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          nextCursor: null,
          hasMore: false,
        }),
      });
    }

    return route.fallback();
  });
}

const mockUserWithCommunication = {
  ...mockUser,
  permissions: {
    ...mockUser.permissions,
    communication: { read: true, write: true, manage: true },
  },
};

const mockUserWithoutCommunication = {
  ...mockUser,
  membershipRole: 'DRIVER',
  permissions: {
    dashboard: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

async function seedSession(page: Page, user: typeof mockUser, locale: 'en' | 'de' = 'en') {
  await page.addInitScript(
    ({ token, authUser, selectedLocale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(authUser));
      localStorage.setItem('synqdrive.locale', selectedLocale);
    },
    { token: 'communication-e2e-token', authUser: user, selectedLocale: locale },
  );
}

export async function openCommunicationCenter(
  page: Page,
  options?: {
    user?: typeof mockUser;
    query?: string;
    locale?: 'en' | 'de';
    emptyInbox?: boolean;
  },
) {
  const user = options?.user ?? mockUserWithCommunication;
  await seedSession(page, user, options?.locale ?? 'en');
  await installTaskMocks(page);
  await installCommunicationMocks(page, { empty: options?.emptyInbox });
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  const query = options?.query ?? 'view=communication-center';
  await page.goto(`/rental?${query}`, { waitUntil: 'domcontentloaded' });
  await page
    .getByTestId('communication-center-view')
    .or(page.getByTestId('communication-center-access-denied'))
    .waitFor({ state: 'visible', timeout: 45000 });
}

export async function openDashboardWithCommunicationNav(
  page: Page,
  user: typeof mockUserWithCommunication = mockUserWithCommunication,
) {
  await seedSession(page, user, 'en');
  await installTaskMocks(page);
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('dashboard-tasks-overview-panel').waitFor({ state: 'visible', timeout: 45000 });
}

export async function expectCommunicationNavVisible(page: Page, visible: boolean) {
  const navItem = page.getByRole('button', { name: /Communication Center/i });
  if (visible) {
    await expect(navItem).toBeVisible();
  } else {
    await expect(navItem).toHaveCount(0);
  }
}

export { mockUserWithCommunication, mockUserWithoutCommunication };
