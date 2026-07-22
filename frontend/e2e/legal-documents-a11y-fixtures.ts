import { expect, type Page, type Route } from '@playwright/test';

const ORG_ID = 'org-legal-a11y-e2e';
const A11Y_ROUTE_PATTERN = '**/api/v1/**';

const A11Y_MOCK_USER = {
  id: 'user-a11y',
  email: 'a11y@example.test',
  name: 'A11y Tester',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: ORG_ID,
  organizationName: 'Legal A11y Rental GmbH',
  organizationLogoUrl: null,
  permissions: {
    'legal-documents': { read: true, write: true, manage: true },
    'legal-documents-audit': { read: true, write: false, manage: false },
  },
};

const sampleLegalDoc = {
  id: 'doc-agb-1',
  documentType: 'TERMS_AND_CONDITIONS',
  title: 'AGB',
  versionLabel: '2026-07',
  language: 'de',
  jurisdiction: 'DE',
  status: 'ACTIVE',
  fileName: 'agb.pdf',
  sizeBytes: 1200,
  checksum: 'abc123',
  scanStatus: 'SCAN_PASSED',
  integrityStatus: 'VERIFIED',
  snapshotCount: 2,
  activeFrom: '2026-07-01T00:00:00.000Z',
  activatedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
};

let a11yRouteHandler: ((route: Route) => Promise<void>) | null = null;

function json(data: unknown) {
  return JSON.stringify(data);
}

export async function installLegalDocumentsA11yMocks(page: Page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem('synqdrive_token', 'legal-a11y-test-token');
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
    localStorage.setItem('synqdrive.locale', 'de');
    sessionStorage.setItem('synqdrive_rental_on_settings', '1');
    sessionStorage.setItem('synqdrive_rental_settings_tab', 'legal-documents');
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

    if (url.includes('/api/v1/organizations/') && url.includes('/legal-documents/settings')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json({ fourEyesEnabled: false }) });
    }

    if (url.includes('/legal-documents/events') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      });
    }

    if (url.match(/\/legal-documents(\?|$)/) && method === 'GET' && !url.includes('/legal-documents/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json([sampleLegalDoc]),
      });
    }

    if (url.includes('/legal-documents?') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [sampleLegalDoc],
          meta: { total: 1, page: 1, limit: 15, totalPages: 1 },
        }),
      });
    }

    if (url.includes('/permissions') || url.includes('/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          permissions: [
            { module: 'legal-documents', level: 'manage' },
            { module: 'legal-documents-audit', level: 'read' },
          ],
        }),
      });
    }

    if (url.includes('/stations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    return route.continue();
  };

  await context.route(A11Y_ROUTE_PATTERN, a11yRouteHandler);
}

export async function openLegalDocumentsAdminTab(page: Page) {
  await page.goto('/rental', { waitUntil: 'load' });
  if (page.url().includes('/login')) {
    throw new Error(`Expected rental shell but landed on login: ${page.url()}`);
  }

  const newVersionButton = page.getByTestId('legal-documents-new-version');
  if (!(await newVersionButton.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: /Kunden-Rechtstexte|Customer legal texts/i }).click();
  }
  await newVersionButton.waitFor({ state: 'visible', timeout: 30_000 });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}
