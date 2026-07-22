import type { Page, Route } from '@playwright/test';

const ORG_ID = 'org-legal-a11y-e2e';
const BASE = 'http://127.0.0.1:5173';

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

function json(data: unknown) {
  return JSON.stringify(data);
}

export async function installLegalDocumentsA11yMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'synqdrive_auth_user',
      JSON.stringify({
        id: 'user-a11y',
        organizationId: 'org-legal-a11y-e2e',
        name: 'A11y Tester',
        email: 'a11y@example.test',
        role: 'ORG_ADMIN',
      }),
    );
    localStorage.setItem('synqdrive_rental_settings_tab', 'legal-documents');
    sessionStorage.setItem('synqdrive_rental_settings_tab', 'legal-documents');
  });

  const handler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

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

    return route.continue();
  };

  await page.route('**/api/v1/**', handler);
}

export async function openLegalDocumentsAdminTab(page: Page) {
  await page.goto(`${BASE}/rental/settings`);
  await page.getByRole('tab', { name: /Kunden-Rechtstexte|legalDocuments/i }).click();
  await page.getByTestId('legal-documents-new-version').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

// re-export expect for fixtures file convenience
import { expect } from '@playwright/test';
