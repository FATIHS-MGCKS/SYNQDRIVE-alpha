import { test, expect } from '@playwright/test';

const ORG_ID = 'org-notif-e2e';

const mockUser = {
  id: 'user-e2e',
  email: 'ops@synqdrive.eu',
  name: 'Ops User',
  platformRole: 'ORG_USER',
  membershipRole: 'ADMIN',
  organizationId: ORG_ID,
  organizationName: 'E2E Rental',
  organizationLogoUrl: null,
  permissions: {},
};

const mockNotification = {
  id: 'notif-e2e-1',
  eventType: 'STATION_SHORTAGE',
  domain: 'OPERATIONS',
  severity: 'WARNING',
  status: 'OPEN',
  entity: { type: 'STATION', id: 'st-1', displayLabel: 'Hannover Mitte' },
  titleKey: 'notification.title.stationShortage',
  bodyKey: 'notification.body.stationShortage',
  templateParams: { label: 'Hannover Mitte', stationName: 'Hannover Mitte' },
  action: { type: 'OPEN_STATION', target: { stationId: 'st-1' } },
  source: { type: 'runtime', ref: 'insights' },
  firstSeenAt: '2026-07-10T08:00:00.000Z',
  lastSeenAt: '2026-07-10T10:00:00.000Z',
  occurrenceCount: 1,
  resolvedAt: null,
  expiresAt: null,
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T10:00:00.000Z',
  userReceipt: {
    readAt: null,
    acknowledgedAt: null,
    snoozedUntil: null,
    hiddenAt: null,
  },
  availableActions: ['read', 'acknowledge', 'snooze', 'open_entity'],
};

async function installDashboardMocks(page: import('@playwright/test').Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('synqdrive_token', 'e2e-test-token');
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
    (window as unknown as { __VITE_NOTIFICATIONS_V2?: string }).__VITE_NOTIFICATIONS_V2 = 'on';
  }, mockUser);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes(`/organizations/${ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: '2026-07-10T11:00:00.000Z',
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
          insights: [],
        }),
      });
    }

    if (url.includes(`/organizations/${ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [] }),
      });
    }

    if (url.includes(`/organizations/${ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? {
                totalActive: 1,
                unread: 1,
                critical: 0,
                warning: 1,
                info: 0,
                resolvedRecent: 0,
                byDomain: { OPERATIONS: 1 },
              }
            : { data: [mockNotification], meta: { limit: 50, nextCursor: null } },
        ),
      });
    }

    return route.continue();
  });
}

test.describe('Dashboard notification panel E2E (mocked API)', () => {
  test('renders V2 notification panel with severity tabs and entity headline', async ({ page }) => {
    await installDashboardMocks(page);
    await page.goto('/');

    const panel = page.getByRole('region', { name: /Meldungen|Notifications/i });
    await expect(panel).toBeVisible({ timeout: 25_000 });
    await expect(panel.getByRole('tab', { name: /Warnungen|Warnings/i })).toBeVisible();
    await expect(panel.getByText('Hannover Mitte')).toBeVisible();
  });
});
