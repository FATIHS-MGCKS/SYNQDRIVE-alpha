import { expect, test } from '@playwright/test';

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

async function installDashboardMocks(page: import('@playwright/test').Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('synqdrive_token', 'e2e-test-token');
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
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
          activeInsightCount: 1,
          error: null,
          summary: { total: 1, critical: 0, warning: 1, opportunity: 0, info: 0 },
          insights: [
            {
              id: 'insight-1',
              type: 'STATION_SHORTAGE',
              severity: 'WARNING',
              priority: 50,
              title: 'Station shortage Hannover',
              message: 'Vehicle gap at Hannover Mitte',
              entityScope: 'STATION',
              entityIds: ['st-1'],
              isGrouped: false,
              groupCount: 1,
              createdAt: '2026-07-10T10:00:00.000Z',
            },
          ],
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
                totalActive: 0,
                unread: 0,
                critical: 0,
                warning: 0,
                info: 0,
                resolvedRecent: 0,
                byDomain: {},
              }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    return route.continue();
  });
}

test.describe('Dashboard notification panel E2E (mocked API)', () => {
  test('renders attention queue with insight-driven item (V1 path)', async ({ page }) => {
    await installDashboardMocks(page);
    await page.goto('/');

    const panel = page.getByRole('region').filter({ hasText: /Station shortage|Stationsengpass|Meldungen|Notifications/i });
    await expect(panel.first()).toBeVisible({ timeout: 25_000 });
  });
});
