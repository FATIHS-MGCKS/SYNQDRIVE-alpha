import { expect, type Page, type Route } from '@playwright/test';

const ORG_ID = 'org-dp-a11y-e2e';
const A11Y_ROUTE_PATTERN = '**/api/v1/**';

const A11Y_MOCK_USER = {
  id: 'user-dp-a11y',
  email: 'dp-a11y@example.test',
  name: 'DP A11y Tester',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: ORG_ID,
  organizationName: 'DP A11y Rental GmbH',
  organizationLogoUrl: null,
  permissions: {
    'data-authorization': { read: true, write: true, manage: true },
  },
};

let a11yRouteHandler: ((route: Route) => Promise<void>) | null = null;

function json(data: unknown) {
  return JSON.stringify(data);
}

export async function installDataProcessingA11yMocks(page: Page) {
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem('synqdrive_token', 'dp-a11y-test-token');
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', 'de');
      sessionStorage.setItem('synqdrive_rental_on_settings', '1');
      sessionStorage.setItem('synqdrive_rental_settings_tab', 'data-authorization');
    },
    { user: A11Y_MOCK_USER },
  );

  const context = page.context();
  if (a11yRouteHandler) {
    await context.unroute(A11Y_ROUTE_PATTERN, a11yRouteHandler);
  }

  a11yRouteHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(A11Y_MOCK_USER) });
    }

    if (url.includes(`/organizations/${ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          id: ORG_ID,
          name: A11Y_MOCK_USER.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes('/hub-metrics') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          activeProcessingActivities: 1,
          blockingControlGaps: 0,
          reviewsDue: 0,
          revocationsInProgress: 0,
          enforcementErrors: 0,
          dpiaOverdue: 0,
          legacy: {
            total: 0,
            active: 0,
            pending: 0,
            revoked: 0,
            expired: 0,
            highRisk: 0,
            expiringSoon: 0,
          },
        }),
      });
    }

    if (url.includes('/processing-activity-register') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [
            {
              id: 'pa-1',
              activityCode: 'PA-FLEET',
              title: 'Fleet telemetry',
              status: 'ACTIVE',
              versionNumber: 1,
              isCurrentVersion: true,
              dpiaStatus: 'NOT_REQUIRED',
              hasBlockingGaps: false,
              dataCategories: ['GPS_LOCATION'],
              completeness: { status: 'COMPLETE', blockingGaps: [] },
              runtimeCoverage: null,
              updatedAt: '2026-07-24T00:00:00.000Z',
            },
          ],
          meta: { limit: 25, nextCursor: null },
        }),
      });
    }

    if (url.includes('/coverage') && method === 'GET' && url.includes('/data-authorizations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          coverageVersion: '2026.07.24',
          totalFlows: 1,
          enforcedCount: 1,
          notImplementedCount: 0,
          enforcementErrorCount: 0,
          partiallyEnforcedCount: 0,
          fullyProtected: true,
          flows: [],
        }),
      });
    }

    if (url.includes('/data-processing-agreements') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/data-authorizations') && method === 'GET' && !url.includes('/audit')) {
      if (
        url.includes('/hub-metrics') ||
        url.includes('/processing-activity-register') ||
        url.includes('/enforcement-coverage') ||
        url.includes('/data-processing-agreements') ||
        url.includes('/authorization-decisions') ||
        url.includes('/revocation-workflows')
      ) {
        return route.continue();
      }
      if (url.match(/\/data-authorizations(\?|$)/)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({ data: [], meta: { limit: 25, nextCursor: null } }),
        });
      }
    }

    if (url.includes('/authorization-decisions') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ items: [], meta: { limit: 25, nextCursor: null } }),
      });
    }

    if (url.includes('/permissions') || url.includes('/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          permissions: [{ module: 'data-authorization', level: 'manage' }],
        }),
      });
    }

    if (url.includes('/notifications') || url.includes('/support')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json({ count: 0 }) });
    }

    if (url.includes('/stations') || url.includes('/vehicles') || url.includes('/fleet')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    return route.continue();
  };

  await context.route(A11Y_ROUTE_PATTERN, a11yRouteHandler);
}

export async function openDataProcessingHub(page: Page) {
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    throw new Error(`Expected rental shell but landed on login: ${page.url()}`);
  }

  const main = page.locator('#data-processing-main');
  if (!(await main.isVisible().catch(() => false))) {
    const adminTab = page.locator('#admin-tab-data-authorization');
    if (await adminTab.isVisible().catch(() => false)) {
      await adminTab.click();
    } else {
      const settingsBtn = page.getByRole('button', { name: /Verwaltung|Administration/i }).first();
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click();
      }
      await page.locator('#admin-tab-data-authorization').click({ timeout: 20_000 });
    }
  }
  await main.waitFor({ state: 'visible', timeout: 45_000 });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}
