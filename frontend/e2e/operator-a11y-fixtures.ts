import { expect, type Page, type Route } from '@playwright/test';

const ORG_ID = 'org-operator-a11y-e2e';

const A11Y_MOCK_USER = {
  id: 'user-operator-a11y',
  email: 'operator-a11y@example.test',
  name: 'Operator A11y Tester',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: ORG_ID,
  organizationName: 'Operator A11y Rental GmbH',
  organizationLogoUrl: null,
  permissions: {},
};

const A11Y_ROUTE_PATTERN = '**/api/v1/**';

let a11yRouteHandler: ((route: Route) => Promise<void>) | null = null;

function json(data: unknown) {
  return JSON.stringify(data);
}

export async function installOperatorA11yMocks(page: Page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('synqdrive_token', 'operator-a11y-test-token');
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
    localStorage.setItem('synqdrive.locale', 'de');
  }, { user: A11Y_MOCK_USER });

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

    if (url.includes('/bookings/today/pickups') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/bookings/today/returns') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/tasks/summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ totalOpen: 0, overdue: 0, dueToday: 0, buckets: {} }),
      });
    }

    if (url.includes('/tasks') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ items: [], total: 0, page: 1, pageSize: 20 }),
      });
    }

    if (url.includes('/fleet/vehicles') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/users') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: json({}) });
  };

  await context.route(A11Y_ROUTE_PATTERN, a11yRouteHandler);
}

export async function openOperatorToday(page: Page) {
  await page.goto('/operator');
  await expect(page.locator(`#${'operator-main-content'}`)).toBeVisible({ timeout: 15000 });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}
