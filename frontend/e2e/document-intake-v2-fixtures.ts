import { expect, type Page } from '@playwright/test';

import {
  mockVehicles,
  readyExtraction,
  resetDocumentUploadMockState,
  setMockExtractionConfirmed,
  TEST_EXTRACTION_ID,
  TEST_ORG_ID,
  TEST_VEHICLE_ID,
} from './document-upload-fixtures';

export type DocumentIntakeV2Profile =
  | 'ready-review'
  | 'awaiting-type'
  | 'applying-guard'
  | 'partial-apply'
  | 'archive-populated'
  | 'cross-tenant';

export const mockUser = {
  id: 'user-test-001',
  email: 'test@synqdrive.eu',
  name: 'Test User',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Test Rental GmbH',
  organizationLogoUrl: null,
  permissions: {
    documents: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

const mockApplyResultApplying = {
  lifecycleStatus: 'APPLYING',
  extractionStatus: 'CONFIRMED',
  summary: 'Uebernahme laeuft — Aktionen werden ausgefuehrt.',
  detailSummary: 'Die Uebernahme kann waehrend der Ausfuehrung nicht abgebrochen werden.',
  isTerminal: false,
  applyingInProgress: true,
  nonCancellable: true,
  requiredActionsComplete: false,
  canRetryFailedActions: false,
  partiallyApplied: false,
  applyFailed: false,
  fingerprint: 'fp-applying',
  actions: [
    {
      actionIndex: 0,
      semanticAction: 'ARCHIVE_DOCUMENT',
      labelKey: 'documentAction.ARCHIVE_DOCUMENT',
      title: 'Dokument archivieren',
      requirement: 'REQUIRED',
      status: 'RUNNING',
      targetModule: 'documents',
      targetModuleLabel: 'Dokumente',
      resultEntityType: null,
      resultEntityId: null,
      entityLink: null,
      errorCode: null,
      errorMessage: null,
      skippedReason: null,
    },
  ],
};

const mockApplyResultApplied = {
  lifecycleStatus: 'APPLIED',
  extractionStatus: 'APPLIED',
  summary: 'Alle Pflichtaktionen wurden erfolgreich ausgefuehrt.',
  detailSummary: null,
  isTerminal: true,
  applyingInProgress: false,
  nonCancellable: false,
  requiredActionsComplete: true,
  canRetryFailedActions: false,
  partiallyApplied: false,
  applyFailed: false,
  fingerprint: 'fp-applied',
  actions: [
    {
      actionIndex: 0,
      semanticAction: 'ARCHIVE_DOCUMENT',
      labelKey: 'documentAction.ARCHIVE_DOCUMENT',
      title: 'Dokument archivieren',
      requirement: 'REQUIRED',
      status: 'SUCCEEDED',
      targetModule: 'documents',
      targetModuleLabel: 'Dokumente',
      resultEntityType: 'vehicle',
      resultEntityId: TEST_VEHICLE_ID,
      entityLink: {
        entityType: 'vehicle',
        entityId: TEST_VEHICLE_ID,
        label: 'Fahrzeug oeffnen',
        targetModule: 'documents',
        targetModuleLabel: 'Dokumente',
      },
      errorCode: null,
      errorMessage: null,
      skippedReason: null,
    },
  ],
};

const mockApplyResultPartial = {
  ...mockApplyResultApplied,
  lifecycleStatus: 'PARTIALLY_APPLIED',
  extractionStatus: 'PARTIALLY_APPLIED',
  summary: 'Pflichtaktionen erledigt, optionale Aktion fehlgeschlagen',
  partiallyApplied: true,
  canRetryFailedActions: true,
  actions: [
    mockApplyResultApplied.actions[0],
    {
      actionIndex: 1,
      semanticAction: 'SUGGEST_ENTITY_LINK',
      labelKey: 'documentAction.SUGGEST_ENTITY_LINK',
      title: 'Verknuepfung vorschlagen',
      requirement: 'OPTIONAL',
      status: 'FAILED',
      targetModule: 'documents',
      targetModuleLabel: 'Dokumente',
      resultEntityType: null,
      resultEntityId: null,
      entityLink: null,
      errorCode: 'TECHNICAL_FAILURE',
      errorMessage: 'Technischer Fehler',
      skippedReason: null,
    },
  ],
};

const awaitingTypeExtraction = {
  ...readyExtraction,
  status: 'AWAITING_DOCUMENT_TYPE',
  processingStage: 'CLASSIFICATION',
  documentType: null,
  effectiveDocumentType: null,
  classificationConfidence: 0.42,
  allowedActions: ['set_document_type', 'reextract', 'cancel'],
  vehicleCandidates: [
    {
      vehicleId: TEST_VEHICLE_ID,
      label: 'Mercedes-Benz E-Klasse',
      licensePlate: 'M-SY 1',
      confidence: 0.88,
      matchReason: 'plate_match',
    },
  ],
};

const archiveItem = {
  id: TEST_EXTRACTION_ID,
  organizationId: TEST_ORG_ID,
  vehicleId: TEST_VEHICLE_ID,
  vehicle: { id: TEST_VEHICLE_ID, label: 'Demo Fahrzeug', licensePlate: 'M-SY 1' },
  sourceFileName: 'service-bericht-2026.pdf',
  mimeType: 'application/pdf',
  status: 'APPLIED',
  documentCategory: 'TECHNICAL',
  documentSubtype: 'SERVICE_REPORT',
  effectiveDocumentType: 'SERVICE',
  acceptedEntityLinks: [],
  actionSummary: {
    status: 'APPLIED',
    lifecycleStatus: 'APPLIED',
    summary: 'Erfolgreich abgelegt',
    succeededCount: 1,
    failedCount: 0,
    pendingCount: 0,
  },
  followUpSummary: {
    status: 'OPEN',
    openCount: 1,
    acceptedCount: 0,
    dismissedCount: 0,
    primaryType: 'PREPARE_CUSTOMER_CONTACT',
    primaryTitle: 'Kundenkontakt vorbereiten',
  },
  uploader: { id: 'user-1', displayName: 'Test User' },
  invoiceNumber: null,
  caseReference: null,
  documentDate: '2026-06-01',
  uploadedAt: '2026-07-17T10:00:00.000Z',
  appliedAt: '2026-07-17T11:00:00.000Z',
  updatedAt: '2026-07-17T11:00:00.000Z',
  canDownload: true,
};

let profile: DocumentIntakeV2Profile = 'ready-review';
let mockExtractionConfirmed = false;
let mockApplyPollCount = 0;
let keepApplyingForever = false;

export function setDocumentIntakeV2Profile(next: DocumentIntakeV2Profile) {
  profile = next;
}

export function resetDocumentIntakeV2MockState() {
  profile = 'ready-review';
  mockExtractionConfirmed = false;
  mockApplyPollCount = 0;
  keepApplyingForever = false;
  resetDocumentUploadMockState();
}

export async function installDocumentIntakeV2Mocks(
  page: Page,
  options?: { preserveConfirmed?: boolean; profile?: DocumentIntakeV2Profile },
) {
  if (options?.profile) {
    profile = options.profile;
  }
  if (!options?.preserveConfirmed) {
    mockExtractionConfirmed = false;
    mockApplyPollCount = 0;
  }

  keepApplyingForever = profile === 'applying-guard';

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

    if (url.includes(`/organizations/${TEST_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_ORG_ID,
          name: mockUser.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'st-test-1', name: 'Hauptstation', city: 'Berlin', latitude: 52.52, longitude: 13.405 },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

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

    if (
      profile === 'cross-tenant' &&
      url.includes('/document-extractions/') &&
      method === 'GET' &&
      !url.includes(TEST_ORG_ID)
    ) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Document extraction not found' }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/document-extractions/archive`) &&
      method === 'GET'
    ) {
      const data =
        profile === 'archive-populated'
          ? [archiveItem]
          : profile === 'awaiting-type'
            ? [{ ...archiveItem, status: 'AWAITING_DOCUMENT_TYPE', actionSummary: { ...archiveItem.actionSummary, status: 'PENDING', summary: 'Typauswahl erforderlich' } }]
            : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          meta: { total: data.length, page: 1, limit: 20, totalPages: data.length ? 1 : 0 },
        }),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/document-extractions`) &&
      method === 'GET' &&
      !url.match(/document-extractions\/[^/?]+/)
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        }),
      });
    }

    if (url.includes('/document-extractions/upload') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_EXTRACTION_ID,
          status: profile === 'awaiting-type' ? 'AWAITING_DOCUMENT_TYPE' : 'QUEUED',
          documentType: profile === 'awaiting-type' ? null : 'SERVICE',
        }),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}`) && method === 'GET') {
      if (profile === 'cross-tenant') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Document extraction not found' }),
        });
      }

      if (mockExtractionConfirmed) {
        if (profile === 'partial-apply') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...readyExtraction,
              status: 'PARTIALLY_APPLIED',
              processingStage: 'APPLY',
              allowedActions: ['retry_failed_actions', 'download'],
              applyResult: mockApplyResultPartial,
            }),
          });
        }

        mockApplyPollCount += 1;
        if (keepApplyingForever || mockApplyPollCount < 3) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...readyExtraction,
              status: keepApplyingForever ? 'APPLIED' : 'CONFIRMED',
              processingStage: 'APPLY',
              allowedActions: [],
              applyResult: mockApplyResultApplying,
            }),
          });
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...readyExtraction,
            status: 'APPLIED',
            processingStage: 'APPLY',
            allowedActions: ['download'],
            applyResult: mockApplyResultApplied,
          }),
        });
      }

      if (profile === 'awaiting-type') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(awaitingTypeExtraction),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(readyExtraction),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}/confirm`) && method === 'POST') {
      mockExtractionConfirmed = true;
      mockApplyPollCount = 0;
      setMockExtractionConfirmed(true);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...readyExtraction,
          status: 'CONFIRMED',
          processingStage: 'APPLY',
          allowedActions: [],
          applyResult: mockApplyResultApplying,
        }),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}/retry`) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...readyExtraction, status: 'QUEUED', processingStage: 'OCR' }),
      });
    }

    if (url.includes(`/document-extractions/${TEST_EXTRACTION_ID}/retry-failed-actions`) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...readyExtraction,
          status: 'APPLIED',
          processingStage: 'APPLY',
          applyResult: mockApplyResultApplied,
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'GET') {
      if (url.includes('/summary')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ open: 0, overdue: 0, dueToday: 0, unassigned: 0 }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, unread: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/price-tariffs`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ priceBook: null, groups: [], assignments: [], unassignedVehicleCount: 0 }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-connectivity`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      });
    }

    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    return route.continue();
  });
}

// Re-export shared constants from document-upload-fixtures (mockUser overridden above for rental bootstrap).
export {
  TEST_EXTRACTION_ID,
  TEST_ORG_ID,
  TEST_VEHICLE_ID,
  mockVehicles,
  readyExtraction,
  resetDocumentUploadMockState,
  setMockExtractionConfirmed,
};

export async function openDocumentIntakeV2(
  page: Page,
  options?: { preserveConfirmed?: boolean; profile?: DocumentIntakeV2Profile; locale?: string; theme?: 'light' | 'dark' },
) {
  await page.addInitScript(({ token, user, locale, theme }) => {
    localStorage.setItem('synqdrive_token', token);
    localStorage.setItem('synqdrive_user', JSON.stringify(user));
    localStorage.setItem('synqdrive.locale', locale);
    if (theme) {
      localStorage.setItem('synqdrive-theme-preference', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, { token: 'test-token', user: mockUser, locale: options?.locale ?? 'de', theme: options?.theme });

  await installDocumentIntakeV2Mocks(page, options);
  await page.goto('/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  if (page.url().includes('/login')) {
    throw new Error(`Expected rental shell but landed on login: ${page.url()}`);
  }
  await navigateToDocumentUploadView(page);
}

export async function navigateToDocumentUploadView(page: Page) {
  const heading = page.getByRole('heading', { name: /Dokumenten-Upload|Document Upload/i });
  if (await heading.isVisible().catch(() => false)) return;

  const uploadBtn = page.getByRole('button', { name: /^(Hochladen|Upload)$/i });
  await uploadBtn.first().waitFor({ state: 'visible', timeout: 30_000 });
  await uploadBtn.first().click();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
}

export async function uploadSamplePdf(page: Page, fileName = 'service-bericht-2026.pdf') {
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  });
}

export async function switchIntakeTab(page: Page, tab: 'upload' | 'review' | 'archive') {
  const labels = {
    upload: /Hochladen|Upload/i,
    review: /Zu prüfen|To review|A verifier/i,
    archive: /Archiv|Archive/i,
  };
  await page.getByRole('tab', { name: labels[tab] }).click();
}

export async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  return metrics;
}

export async function assertNoFalseAppliedSuccess(page: Page) {
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/erfolgreich abgelegt|successfully filed/i);
}
