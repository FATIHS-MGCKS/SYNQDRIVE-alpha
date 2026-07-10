import { expect, type Page } from '@playwright/test';

export const TEST_ORG_ID = 'org-test-001';
export const TEST_VEHICLE_ID = 'veh-test-001';
export const TEST_EXTRACTION_ID = 'ext-test-001';

export const mockUser = {
  id: 'user-test-001',
  email: 'test@synqdrive.eu',
  name: 'Test User',
  platformRole: 'ORG_USER',
  membershipRole: 'ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Test Rental GmbH',
  organizationLogoUrl: null,
  permissions: {
    documents: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
  },
};

export const mockVehicles = {
  data: [
    {
      id: TEST_VEHICLE_ID,
      vehicleName: 'Mercedes-Benz E-Klasse Langversion Flottenfahrzeug 2024',
      make: 'Mercedes-Benz',
      model: 'E-Klasse',
      year: 2024,
    },
  ],
};

export const readyExtraction = {
  id: TEST_EXTRACTION_ID,
  vehicleId: TEST_VEHICLE_ID,
  organizationId: TEST_ORG_ID,
  status: 'READY_FOR_REVIEW',
  processingStage: 'REVIEW',
  documentType: 'SERVICE',
  effectiveDocumentType: 'SERVICE',
  requestedDocumentType: 'AUTO',
  classificationMode: 'AUTO',
  classificationConfidence: 0.91,
  sourceFileName: 'sehr-langer-servicebericht-mit-vielen-zeichen-im-dateinamen-2026.pdf',
  hasStoredFile: true,
  allowedActions: ['confirm', 'reextract', 'set_document_type', 'download', 'cancel'],
  extractedData: {
    eventDate: '2026-06-01',
    odometerKm: 48210,
    workshopName: 'Werkstatt Mustermann mit sehr langem Namen GmbH & Co. KG',
    description: 'Inspektion inklusive Ölwechsel und umfangreicher Diagnosearbeiten',
    costCents: 38950,
    invoiceNumber: 'RE-2026-009871234567890',
  },
  plausibility: {
    overallStatus: 'WARNING',
    checks: [
      {
        code: 'ODOMETER_HIGH',
        status: 'WARNING',
        source: 'rule_engine',
        message: 'Der Kilometerstand wirkt ungewöhnlich hoch für das Fahrzeugalter und sollte manuell geprüft werden.',
      },
    ],
    recommendedHumanReviewNotes: ['Bitte Rechnungsdatum mit Service-Datum abgleichen.'],
  },
};

let mockExtractionConfirmed = false;

export function setMockExtractionConfirmed(confirmed: boolean) {
  mockExtractionConfirmed = confirmed;
}

export function resetDocumentUploadMockState() {
  mockExtractionConfirmed = false;
}

export async function installDocumentUploadMocks(
  page: Page,
  options?: { preserveConfirmed?: boolean },
) {
  if (!options?.preserveConfirmed) {
    mockExtractionConfirmed = false;
  }
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockVehicles),
      });
    }

    if (url.includes('/document-extractions/metadata') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentTypes: [
            { value: 'SERVICE', labelKey: 'documentExtraction.type.SERVICE' },
            { value: 'INVOICE', labelKey: 'documentExtraction.type.INVOICE' },
          ],
          classificationOptions: [{ value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' }],
          mimeTypes: ['application/pdf'],
          extensions: ['.pdf'],
          maxUploadBytes: 10485760,
          maxUploadMb: 10,
          statuses: [],
          stages: [],
          errorPhases: [],
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/document-extractions`) && method === 'GET' && !url.includes('/document-extractions/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      });
    }

    if (url.includes('/document-extractions/upload') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_EXTRACTION_ID,
          status: 'QUEUED',
          documentType: 'SERVICE',
        }),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          mockExtractionConfirmed
            ? { ...readyExtraction, status: 'APPLIED', processingStage: 'APPLY', allowedActions: ['download'] }
            : readyExtraction,
        ),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}/confirm`) && method === 'POST') {
      mockExtractionConfirmed = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...readyExtraction, status: 'CONFIRMED', processingStage: 'APPLY' }),
      });
    }
    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}/retry`) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...readyExtraction, status: 'QUEUED' }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

export async function openDocumentUpload(page: Page, options?: { preserveConfirmed?: boolean }) {
  await page.addInitScript(({ token, user, locale }) => {
    localStorage.setItem('synqdrive_token', token);
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
    localStorage.setItem('synqdrive.locale', locale);
  }, { token: 'test-token', user: mockUser, locale: 'de' });

  await installDocumentUploadMocks(page, options);
  await page.goto('/rental', { waitUntil: 'networkidle' });
  await navigateToDocumentUploadView(page);
}

/** Opens the rental document-upload view from dashboard (mobile + desktop). */
export async function navigateToDocumentUploadView(page: Page) {
  const heading = page.getByRole('heading', { name: 'Dokumenten-Upload' });
  if (await heading.isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page
      .locator('div.lg\\:hidden.fixed.top-0')
      .getByRole('button', { name: 'Hochladen', exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: 'Hochladen', exact: true }).click();
  }

  await heading.waitFor({ state: 'visible', timeout: 15000 });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  return metrics;
}
