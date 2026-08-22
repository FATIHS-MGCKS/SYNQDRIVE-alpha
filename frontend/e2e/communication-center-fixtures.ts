/**
 * Playwright fixtures for Communication Center shell + inbox E2E.
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow, installTaskMocks, mockUser, TEST_ORG_ID } from './task-fixtures';
import {
  COMMUNICATION_DETAIL_FIXTURE,
  COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE,
  COMMUNICATION_TIMELINE_PAGE_1,
  COMMUNICATION_TIMELINE_PAGE_2,
  COMMUNICATION_VOICE_DETAIL_FIXTURE,
  COMMUNICATION_VOICE_TIMELINE,
  MOCK_CONVERSATION_DETAIL_ID,
} from '../src/lib/communication/communication-timeline.fixture';

export { assertNoHorizontalOverflow, TEST_ORG_ID };
export const DEEP_LINK_CONVERSATION_ID = MOCK_CONVERSATION_DETAIL_ID;

export const MOCK_CONVERSATION_ID = '00000000-0000-4000-8000-000000000101';
export const ORG_A_ID = 'org-communication-a-e2e';
export const ORG_B_ID = 'org-communication-b-e2e';

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
    displayLabel: 'Voice Customer',
    lastMessagePreview: null,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: { id: 'user-1', displayName: 'Ops User' },
    assignedAgent: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    channel: 'SMS',
    status: 'WAITING_CUSTOMER',
    unreadCount: 1,
    lastActivityAt: '2026-08-22T08:00:00.000Z',
    displayLabel: 'SMS Customer',
    lastMessagePreview: 'Need help',
    customer: { id: 'cust-2', displayName: 'SMS Customer' },
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
    assignedAgent: null,
  },
];

type CommunicationMockOptions = {
  empty?: boolean;
  orgId?: string;
  failPage2?: boolean;
  searchRace?: boolean;
  smsDelayMs?: number;
  listDelayMs?: number;
  failTimelinePage2?: boolean;
  failTimelineInitial?: boolean;
  detailNotFound?: boolean;
  detailForbidden?: boolean;
  whatsappConfigured?: boolean;
  voiceConfigured?: boolean;
  smsConfigured?: boolean;
};

const defaultSmsConfig = {
  organizationId: TEST_ORG_ID,
  hasConfigRow: false,
  isConnected: false,
  isActive: false,
  credentialsConfigured: false,
  webhookSigningConfigured: false,
  senderProfileConfigured: false,
  webhookEndpointConfigured: false,
  lastWebhookAt: null,
  updatedAt: null,
};

const searchRaceDelays = new Map<string, ReturnType<typeof setTimeout>>();

export async function installCommunicationMocks(
  page: Page,
  options?: CommunicationMockOptions,
) {
  const orgId = options?.orgId ?? TEST_ORG_ID;

  await page.route(`**/organizations/${orgId}/communication/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();

    if (url.includes('/communication/conversations/summary')) {
      const unread = orgId === ORG_B_ID ? 1 : options?.empty ? 0 : 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalUnreadMessages: unread,
          unreadConversations: unread,
          unassigned: options?.empty ? 0 : 1,
          requiresAttention: options?.empty ? 0 : 1,
          byChannel: options?.empty ? {} : { WHATSAPP: 1, VOICE: 1, SMS: 1 },
        }),
      });
    }

    if (url.includes('/communication/conversations/attention-preview')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: options?.empty ? [] : mockConversations,
        }),
      });
    }

    if (url.includes('/communication/conversations/') && url.includes('/events')) {
      const conversationId = url.match(/conversations\/([^/]+)\/events/)?.[1];
      const params = new URL(url).searchParams;
      const cursor = params.get('cursor');

      if (options?.failTimelinePage2 && cursor === 'cursor-older') {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }

      if (options?.failTimelineInitial && !cursor) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }

      if (conversationId === COMMUNICATION_VOICE_DETAIL_FIXTURE.id) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(COMMUNICATION_VOICE_TIMELINE),
        });
      }

      if (cursor === 'cursor-older') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(COMMUNICATION_TIMELINE_PAGE_2),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COMMUNICATION_TIMELINE_PAGE_1),
      });
    }

    if (
      url.match(/\/communication\/conversations\/[^/]+$/) &&
      !url.includes('/summary') &&
      !url.includes('attention-preview')
    ) {
      const conversationId = url.match(/conversations\/([^/?]+)/)?.[1];
      if (options?.detailNotFound) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      if (options?.detailForbidden) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      }
      if (conversationId === COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE.id) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE),
        });
      }
      if (conversationId === COMMUNICATION_VOICE_DETAIL_FIXTURE.id) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(COMMUNICATION_VOICE_DETAIL_FIXTURE),
        });
      }
      if (conversationId === MOCK_CONVERSATION_DETAIL_ID || conversationId?.startsWith('search-')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...COMMUNICATION_DETAIL_FIXTURE,
            id: conversationId,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COMMUNICATION_DETAIL_FIXTURE),
      });
    }

    if (url.includes('/communication/conversations')) {
      if (options?.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs));
      }

      const params = new URL(url).searchParams;
      const search = params.get('search') ?? '';
      const channel = params.get('channel');
      const unreadOnly = params.get('unreadOnly') === 'true';
      const cursor = params.get('cursor');
      const limit = Number(params.get('limit') ?? '0');
      const returnFullList = limit >= 30;

      if (options?.searchRace && search) {
        const delayMs = search === 'A' ? 1500 : 100;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delayMs);
          searchRaceDelays.set(`${search}:${Date.now()}`, timer);
        });

        const label = search === 'A' ? 'Result A' : search === 'AB' ? 'Result AB' : `Result ${search}`;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                ...mockConversations[0],
                id: `search-${search}`,
                displayLabel: label,
                lastMessagePreview: `Preview ${label}`,
              },
            ],
            nextCursor: null,
            hasMore: false,
          }),
        });
      }

      let items = options?.empty ? [] : [...mockConversations];
      if (orgId === ORG_A_ID && !options?.empty) {
        items = items.map((row) => ({
          ...row,
          displayLabel: 'Org A customer',
          lastMessagePreview: 'Org A preview',
        }));
      }
      if (orgId === ORG_B_ID && !options?.empty) {
        items = items.map((row) => ({
          ...row,
          displayLabel: 'Org B customer',
          lastMessagePreview: 'Org B preview',
        }));
      }

      if (channel) items = items.filter((row) => row.channel === channel);
      if (channel === 'SMS' && options?.smsDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.smsDelayMs));
      }
      if (unreadOnly) items = items.filter((row) => row.unreadCount > 0);
      if (search) {
        items = items.filter((row) =>
          row.displayLabel.toLowerCase().includes(search.toLowerCase()),
        );
      }

      if (cursor === 'page-2') {
        if (options?.failPage2) {
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
        const first = items[0];
        const second = items[1] ?? {
          ...items[0],
          id: '00000000-0000-4000-8000-000000000104',
          displayLabel: 'Page Two Customer',
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [first, second],
            nextCursor: null,
            hasMore: false,
          }),
        });
      }

      if (!options?.empty && !cursor && items.length > 0 && !returnFullList) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: items.slice(0, 1),
            nextCursor: items.length > 1 ? 'page-2' : null,
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

  await page.route(`**/organizations/${orgId}/whatsapp/config`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const configured = options?.whatsappConfigured ?? true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        configured
          ? {
              isConnected: true,
              providerConfigured: true,
              providerStatus: 'CONNECTED',
              accessTokenConfigured: true,
            }
          : {
              isConnected: false,
              providerConfigured: false,
              providerStatus: 'DISCONNECTED',
              accessTokenConfigured: false,
            },
      ),
    });
  });

  await page.route(`**/organizations/${orgId}/voice-assistant`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    if (url.includes('/readiness') || url.includes('/voices')) return route.fallback();
    const configured = options?.voiceConfigured ?? true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        configured
          ? {
              status: 'ACTIVE',
              connectionStatus: 'CONNECTED',
              telephonyEnabled: true,
              name: 'Fleet Assistant',
            }
          : {
              status: 'INACTIVE',
              connectionStatus: 'DISCONNECTED',
              telephonyEnabled: false,
              name: 'Fleet Assistant',
            },
      ),
    });
  });

  await page.route(`**/organizations/${orgId}/voice-assistant/readiness`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ready: true, checks: [] }),
    });
  });

  await page.route(`**/organizations/${orgId}/voice-assistant/voices`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/organizations/${orgId}/sms/config`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const configured = options?.smsConfigured ?? false;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        configured
          ? {
              ...defaultSmsConfig,
              hasConfigRow: true,
              isConnected: true,
              isActive: true,
              credentialsConfigured: true,
              webhookSigningConfigured: true,
              senderProfileConfigured: true,
              webhookEndpointConfigured: true,
              updatedAt: '2026-08-22T10:00:00.000Z',
            }
          : defaultSmsConfig,
      ),
    });
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

async function seedSession(
  page: Page,
  user: typeof mockUser,
  locale: 'en' | 'de' = 'en',
  orgId = TEST_ORG_ID,
) {
  await page.addInitScript(
    ({ token, authUser, selectedLocale, selectedOrgId }) => {
      if (sessionStorage.getItem('communication-e2e-session-seeded')) return;
      sessionStorage.setItem('communication-e2e-session-seeded', '1');
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(authUser));
      localStorage.setItem('synqdrive.locale', selectedLocale);
      localStorage.setItem('synqdrive.selectedOrgId', selectedOrgId);
    },
    {
      token: 'communication-e2e-token',
      authUser: { ...user, organizationId: orgId },
      selectedLocale: locale,
      selectedOrgId: orgId,
    },
  );
}

export async function openCommunicationCenter(
  page: Page,
  options?: {
    user?: typeof mockUser;
    query?: string;
    locale?: 'en' | 'de';
    emptyInbox?: boolean;
    orgId?: string;
    searchRace?: boolean;
    failPage2?: boolean;
    smsDelayMs?: number;
    listDelayMs?: number;
    failTimelinePage2?: boolean;
    failTimelineInitial?: boolean;
    detailNotFound?: boolean;
    detailForbidden?: boolean;
    whatsappConfigured?: boolean;
    voiceConfigured?: boolean;
    smsConfigured?: boolean;
  },
) {
  const user = options?.user ?? mockUserWithCommunication;
  const orgId = options?.orgId ?? TEST_ORG_ID;
  await seedSession(page, user, options?.locale ?? 'en', orgId);
  await installTaskMocks(page);
  await installCommunicationMocks(page, {
    empty: options?.emptyInbox,
    orgId,
    searchRace: options?.searchRace,
    failPage2: options?.failPage2,
    smsDelayMs: options?.smsDelayMs,
    listDelayMs: options?.listDelayMs,
    failTimelinePage2: options?.failTimelinePage2,
    failTimelineInitial: options?.failTimelineInitial,
    detailNotFound: options?.detailNotFound,
    detailForbidden: options?.detailForbidden,
    whatsappConfigured: options?.whatsappConfigured,
    voiceConfigured: options?.voiceConfigured,
    smsConfigured: options?.smsConfigured,
  });
  await page.route('**/auth/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...user, organizationId: orgId }),
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

export async function installDualOrgCommunicationMocks(page: Page) {
  await installCommunicationMocks(page, { orgId: ORG_A_ID });
  await installCommunicationMocks(page, { orgId: ORG_B_ID });
}

export { mockUserWithCommunication, mockUserWithoutCommunication };
