import { expect, type Page, type Route } from '@playwright/test';

export const LEGAL_E2E_ORG_ID = 'org-legal-flow-e2e';
export const LEGAL_E2E_FOREIGN_ORG_ID = 'org-foreign-e2e';
export const LEGAL_E2E_BOOKING_ID = 'bk-legal-e2e-1';
export const LEGAL_E2E_USER_ADMIN = 'user-legal-admin';
export const LEGAL_E2E_USER_REVIEWER = 'user-legal-reviewer';

export const LEGAL_E2E_MOCK_USER = {
  id: LEGAL_E2E_USER_ADMIN,
  email: 'legal-e2e@example.test',
  name: 'Legal E2E User',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: LEGAL_E2E_ORG_ID,
  organizationName: 'Legal E2E Rental GmbH',
  organizationLogoUrl: null,
  permissions: {
    'legal-documents': { read: true, write: true, manage: true },
    'legal-documents-audit': { read: true, write: false, manage: false },
    bookings: { read: true, write: true, manage: true },
  },
};

const LEGAL_E2E_ROUTE_PATTERN = '**/api/**';
let legalFlowRouteHandler: ((route: Route) => Promise<void>) | null = null;

function parseMultipartField(body: string | null, field: string): string | null {
  if (!body) return null;
  const match = body.match(new RegExp(`name="${field}"\\r\\n\\r\\n([^\\r\\n]+)`));
  return match?.[1] ?? null;
}

export type LegalFlowProfile =
  | 'lifecycle-default'
  | 'pickup-blocked'
  | 'pickup-allowed'
  | 'activation-conflict'
  | 'scan-failed'
  | 'integrity-failed'
  | 'historical-snapshot';

type LegalDocRow = {
  id: string;
  organizationId: string;
  documentType: string;
  legalVariant: string | null;
  title: string;
  versionLabel: string;
  language: string;
  jurisdiction: string;
  status: string;
  fileName: string;
  sizeBytes: number;
  checksum: string;
  scanStatus: string;
  integrityStatus: string;
  snapshotCount: number;
  activeFrom: string | null;
  activatedAt: string | null;
  createdAt: string;
  uploadedBy?: { id: string; displayName: string };
  submittedForReviewBy?: { id: string; displayName: string } | null;
  approvedBy?: { id: string; displayName: string } | null;
};

type DeliveryEvidenceRow = {
  id: string;
  organizationId: string;
  bookingId: string;
  legalDocumentId: string;
  documentType: string;
  versionLabel: string;
  deliveryStatus: string;
  requestId: string;
};

const state = {
  profile: 'lifecycle-default' as LegalFlowProfile,
  currentUserId: LEGAL_E2E_USER_ADMIN,
  documents: [] as LegalDocRow[],
  events: [] as Array<Record<string, unknown>>,
  deliveryEvidence: [] as DeliveryEvidenceRow[],
  activateAttemptCount: 0,
  bookingLegalSnapshotVersion: '2026-01',
  bookingDocumentsComplete: false,
};

function json(data: unknown) {
  return JSON.stringify(data);
}

function nowIso() {
  return new Date().toISOString();
}

function baseDoc(overrides: Partial<LegalDocRow> & Pick<LegalDocRow, 'id' | 'versionLabel' | 'status'>): LegalDocRow {
  return {
    organizationId: LEGAL_E2E_ORG_ID,
    documentType: 'TERMS_AND_CONDITIONS',
    legalVariant: null,
    title: 'AGB',
    language: 'de',
    jurisdiction: 'DE',
    fileName: 'agb.pdf',
    sizeBytes: 2048,
    checksum: 'sha256-legal-e2e',
    scanStatus: 'SCAN_PASSED',
    integrityStatus: 'VERIFIED',
    snapshotCount: 0,
    activeFrom: null,
    activatedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    uploadedBy: { id: LEGAL_E2E_USER_ADMIN, displayName: 'Legal Admin' },
    submittedForReviewBy: null,
    approvedBy: null,
    ...overrides,
  };
}

export function resetLegalDocumentsFlowState(profile: LegalFlowProfile = 'lifecycle-default') {
  state.profile = profile;
  state.currentUserId = LEGAL_E2E_USER_ADMIN;
  state.activateAttemptCount = 0;
  state.deliveryEvidence = [];
  state.bookingLegalSnapshotVersion = '2026-01';
  state.bookingDocumentsComplete = profile === 'pickup-allowed';

  if (profile === 'historical-snapshot') {
    state.documents = [
      baseDoc({ id: 'doc-agb-v1', versionLabel: '2026-01', status: 'SUPERSEDED', activatedAt: '2026-01-01T00:00:00.000Z' }),
      baseDoc({ id: 'doc-agb-v2', versionLabel: '2026-07', status: 'ACTIVE', activatedAt: '2026-07-01T00:00:00.000Z' }),
    ];
    state.bookingLegalSnapshotVersion = '2026-01';
    state.events = [];
    return;
  }

  if (profile === 'scan-failed') {
    state.documents = [
      baseDoc({
        id: 'doc-scan-fail',
        versionLabel: '2026-scan-fail',
        status: 'APPROVED',
        scanStatus: 'SCAN_FAILED',
      }),
    ];
    state.events = [];
    return;
  }

  if (profile === 'integrity-failed') {
    state.documents = [
      baseDoc({
        id: 'doc-integrity-fail',
        versionLabel: '2026-integrity',
        status: 'ACTIVE',
        integrityStatus: 'CHECKSUM_MISMATCH',
        activatedAt: nowIso(),
      }),
    ];
    state.events = [];
    return;
  }

  if (profile === 'activation-conflict') {
    state.documents = [
      baseDoc({ id: 'doc-conflict-a', versionLabel: 'conflict-a', status: 'APPROVED' }),
      baseDoc({ id: 'doc-conflict-b', versionLabel: 'conflict-b', status: 'APPROVED' }),
    ];
    state.events = [];
    return;
  }

  state.documents = [
    baseDoc({ id: 'doc-agb-active', versionLabel: '2026-01', status: 'ACTIVE', activatedAt: '2026-01-01T00:00:00.000Z', snapshotCount: 3 }),
  ];
  state.events = [
    {
      id: 'evt-1',
      organizationId: LEGAL_E2E_ORG_ID,
      legalDocumentId: 'doc-agb-active',
      eventType: 'ACTIVATED',
      previousStatus: 'APPROVED',
      newStatus: 'ACTIVE',
      versionLabel: '2026-01',
      language: 'de',
      documentType: 'TERMS_AND_CONDITIONS',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

function pushEvent(doc: LegalDocRow, eventType: string, previousStatus: string | null, newStatus: string) {
  state.events.unshift({
    id: `evt-${state.events.length + 1}`,
    organizationId: LEGAL_E2E_ORG_ID,
    legalDocumentId: doc.id,
    eventType,
    previousStatus,
    newStatus,
    versionLabel: doc.versionLabel,
    language: doc.language,
    documentType: doc.documentType,
    createdAt: nowIso(),
  });
}

function orgFromUrl(url: string): string | null {
  const m = url.match(/\/organizations\/([^/]+)\//);
  return m?.[1] ?? null;
}

function docById(id: string): LegalDocRow | undefined {
  return state.documents.find((d) => d.id === id);
}

function applyLifecycle(
  doc: LegalDocRow,
  action: string,
  body: Record<string, unknown>,
): LegalDocRow | { error: { status: number; code: string; message: string } } {
  const previous = doc.status;

  switch (action) {
    case 'submit-for-review':
      if (doc.status !== 'DRAFT') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION', message: 'Invalid transition' } };
      }
      doc.status = 'IN_REVIEW';
      doc.submittedForReviewBy = { id: state.currentUserId, displayName: 'Reviewer' };
      pushEvent(doc, 'SUBMITTED_FOR_REVIEW', previous, doc.status);
      return doc;
    case 'request-changes':
      if (doc.status !== 'IN_REVIEW') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION', message: 'Invalid transition' } };
      }
      doc.status = 'DRAFT';
      pushEvent(doc, 'CHANGES_REQUESTED', previous, doc.status);
      return doc;
    case 'approve':
      if (doc.status !== 'IN_REVIEW') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION', message: 'Invalid transition' } };
      }
      doc.status = 'APPROVED';
      doc.approvedBy = { id: state.currentUserId, displayName: 'Reviewer' };
      pushEvent(doc, 'APPROVED', previous, doc.status);
      return doc;
    case 'schedule': {
      if (doc.status !== 'APPROVED') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION', message: 'Invalid transition' } };
      }
      doc.status = 'SCHEDULED';
      doc.activeFrom = String(body.validFrom ?? nowIso());
      pushEvent(doc, 'SCHEDULED', previous, doc.status);
      return doc;
    }
    case 'activate': {
      if (doc.status !== 'APPROVED' && doc.status !== 'SCHEDULED' && doc.status !== 'ACTIVE') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_NOT_ACTIVATABLE', message: 'Not activatable' } };
      }
      if (doc.scanStatus !== 'SCAN_PASSED') {
        return { error: { status: 422, code: 'LEGAL_DOCUMENT_SCAN_NOT_PASSED', message: 'Scan not passed' } };
      }
      if (state.profile === 'activation-conflict') {
        state.activateAttemptCount += 1;
        if (state.activateAttemptCount > 1) {
          return {
            error: {
              status: 409,
              code: 'LEGAL_DOCUMENT_ACTIVE_CONFLICT',
              message: 'Another version is already active',
            },
          };
        }
      }
      for (const peer of state.documents) {
        if (
          peer.id !== doc.id &&
          peer.documentType === doc.documentType &&
          peer.language === doc.language &&
          peer.status === 'ACTIVE'
        ) {
          peer.status = 'SUPERSEDED';
          pushEvent(peer, 'SUPERSEDED', 'ACTIVE', 'SUPERSEDED');
        }
      }
      doc.status = 'ACTIVE';
      doc.activatedAt = nowIso();
      doc.activeFrom = doc.activeFrom ?? nowIso();
      pushEvent(doc, 'ACTIVATED', previous, doc.status);
      return doc;
    }
    default:
      return { error: { status: 404, code: 'NOT_FOUND', message: 'Unknown action' } };
  }
}

async function handleLegalDocumentsRoute(route: Route) {
  const url = route.request().url();
  const method = route.request().method();
  const orgId = orgFromUrl(url);

  if (orgId === LEGAL_E2E_FOREIGN_ORG_ID) {
    return route.fulfill({ status: 403, contentType: 'application/json', body: json({ message: 'Forbidden' }) });
  }

  if (orgId && orgId !== LEGAL_E2E_ORG_ID) {
    return route.fulfill({ status: 404, contentType: 'application/json', body: json({ message: 'Not found' }) });
  }

  if (url.includes('/legal-documents/settings') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: json({ fourEyesEnabled: false }) });
  }

  if (url.includes('/legal-documents/events') && method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({ data: state.events, meta: { total: state.events.length, page: 1, limit: 20, totalPages: 1 } }),
    });
  }

  if (url.match(/\/legal-documents\/[^/]+\/usage/) && method === 'GET') {
    const docId = url.split('/legal-documents/')[1]?.split('/')[0] ?? '';
    const doc = docById(docId);
    const snapshotVersion =
      state.profile === 'historical-snapshot' && doc?.versionLabel === '2026-01'
        ? state.bookingLegalSnapshotVersion
        : doc?.versionLabel ?? '—';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({
        legalDocumentId: docId,
        summary: {
          snapshotCount: doc?.snapshotCount ?? 0,
          deliveryEvidenceCount: state.deliveryEvidence.length,
          frozenSnapshotVersion: snapshotVersion,
        },
        references: {
          data: [
            {
              bookingId: LEGAL_E2E_BOOKING_ID,
              versionLabel: snapshotVersion,
              immutable: true,
            },
          ],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
      }),
    });
  }

  const lifecycleMatch = url.match(/\/legal-documents\/([^/]+)\/(submit-for-review|request-changes|approve|schedule|activate)/);
  if (lifecycleMatch && method === 'POST') {
    const docId = lifecycleMatch[1];
    const action = lifecycleMatch[2];
    const doc = docById(docId);
    if (!doc) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: json({ message: 'Not found' }) });
    }
    const body = route.request().postDataJSON?.() ?? {};
    const result = applyLifecycle(doc, action, body);
    if ('error' in result) {
      return route.fulfill({
        status: result.error.status,
        contentType: 'application/json',
        body: json({ message: result.error.message, code: result.error.code }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: json(result) });
  }

  if (url.includes('/legal-documents/upload') && method === 'POST') {
    const postData = route.request().postData();
    const versionLabel = parseMultipartField(postData, 'versionLabel') ?? '2026-07-draft';
    const id = `doc-upload-${Date.now()}`;
    const doc = baseDoc({ id, versionLabel, status: 'DRAFT' });
    state.documents.unshift(doc);
    pushEvent(doc, 'UPLOADED', null, 'DRAFT');
    return route.fulfill({ status: 201, contentType: 'application/json', body: json(doc) });
  }

  const docDetailMatch = url.match(/\/legal-documents\/([^/?]+)$/);
  if (docDetailMatch && method === 'GET') {
    const doc = docById(docDetailMatch[1]);
    if (!doc) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: json({ message: 'Not found' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: json(doc) });
  }

  if (
    method === 'GET' &&
    /\/legal-documents(\?|$)/.test(url) &&
    !/\/legal-documents\/[^/?]+/.test(url)
  ) {
    const urlObj = new URL(url);
    let docs = [...state.documents];
    const documentType = urlObj.searchParams.get('documentType');
    const language = urlObj.searchParams.get('language');
    const status = urlObj.searchParams.get('status');
    const jurisdiction = urlObj.searchParams.get('jurisdiction');
    if (documentType) docs = docs.filter((d) => d.documentType === documentType);
    if (language) docs = docs.filter((d) => d.language === language);
    if (status) docs = docs.filter((d) => d.status === status);
    if (jurisdiction) docs = docs.filter((d) => d.jurisdiction === jurisdiction);

    if (url.includes('?')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: docs,
          meta: { total: docs.length, page: 1, limit: 15, totalPages: docs.length ? 1 : 0 },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json(docs),
    });
  }

  return route.continue();
}

async function handleBookingRoute(route: Route) {
  const url = route.request().url();
  const method = route.request().method();
  const orgId = orgFromUrl(url);

  if (!url.includes('/bookings/')) return route.continue();
  if (orgId === LEGAL_E2E_FOREIGN_ORG_ID) {
    return route.fulfill({ status: 403, contentType: 'application/json', body: json({ message: 'Forbidden' }) });
  }

  if (url.includes(`/bookings/${LEGAL_E2E_BOOKING_ID}`) && method === 'GET') {
    const legalComplete = state.bookingDocumentsComplete;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: json({
        id: LEGAL_E2E_BOOKING_ID,
        status: 'CONFIRMED',
        statusEnum: 'CONFIRMED',
        documents: {
          bundleStatus: legalComplete ? 'COMPLETE' : 'INCOMPLETE',
          legalTermsAttached: legalComplete,
          legalWithdrawalAttached: legalComplete,
          slots: legalComplete
            ? [
                { required: true, available: true, documentType: 'TERMS_AND_CONDITIONS' },
                { required: true, available: true, documentType: 'CONSUMER_INFORMATION' },
                { required: true, available: true, documentType: 'PRIVACY_POLICY' },
              ]
            : [{ required: true, available: false, documentType: 'TERMS_AND_CONDITIONS' }],
        },
        handover: { pickup: null, return: null },
        legalSnapshotVersion: state.bookingLegalSnapshotVersion,
      }),
    });
  }

  if (url.includes('/handover/pickup') && method === 'POST') {
    if (!state.bookingDocumentsComplete) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: json({
          message: 'Pickup blocked — legal documents incomplete',
          code: 'PICKUP_GATE_BLOCKED',
        }),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: json({ booking: { id: LEGAL_E2E_BOOKING_ID, status: 'ACTIVE' } }),
    });
  }

  if (url.includes('/legal-document-delivery-evidence') && method === 'POST') {
    const body = route.request().postDataJSON?.() ?? {};
    const requestId = String(body.requestId ?? `req-${Date.now()}`);
    const existing = state.deliveryEvidence.find((e) => e.requestId === requestId);
    if (existing) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(existing) });
    }
    const row: DeliveryEvidenceRow = {
      id: `ev-${state.deliveryEvidence.length + 1}`,
      organizationId: LEGAL_E2E_ORG_ID,
      bookingId: LEGAL_E2E_BOOKING_ID,
      legalDocumentId: String(body.legalDocumentId ?? 'doc-agb-active'),
      documentType: 'TERMS_AND_CONDITIONS',
      versionLabel: String(body.versionLabel ?? '2026-01'),
      deliveryStatus: 'PRESENTED',
      requestId,
    };
    state.deliveryEvidence.push(row);
    return route.fulfill({ status: 201, contentType: 'application/json', body: json(row) });
  }

  return route.continue();
}

export async function installLegalDocumentsFlowMocks(
  page: Page,
  options?: { profile?: LegalFlowProfile; userId?: string },
) {
  resetLegalDocumentsFlowState(options?.profile ?? 'lifecycle-default');
  if (options?.userId) state.currentUserId = options.userId;

  await page.addInitScript(() => {
    localStorage.setItem('synqdrive_token', 'legal-e2e-test-token');
    localStorage.setItem(
      'synqdrive_user',
      JSON.stringify({
        id: 'user-legal-admin',
        email: 'legal-e2e@example.test',
        name: 'Legal E2E User',
        platformRole: 'ORG_USER',
        membershipRole: 'ORG_ADMIN',
        organizationId: 'org-legal-flow-e2e',
        organizationName: 'Legal E2E Rental GmbH',
        organizationLogoUrl: null,
        permissions: {
          'legal-documents': { read: true, write: true, manage: true },
          'legal-documents-audit': { read: true, write: false, manage: false },
          bookings: { read: true, write: true, manage: true },
        },
      }),
    );
    localStorage.setItem('synqdrive.locale', 'de');
    sessionStorage.setItem('synqdrive_rental_on_settings', '1');
    sessionStorage.setItem('synqdrive_rental_settings_tab', 'legal-documents');
  });

  const context = page.context();
  if (legalFlowRouteHandler) {
    await context.unroute(LEGAL_E2E_ROUTE_PATTERN, legalFlowRouteHandler);
  }

  legalFlowRouteHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json(LEGAL_E2E_MOCK_USER),
      });
    }

    if (url.includes(`/organizations/${LEGAL_E2E_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          id: LEGAL_E2E_ORG_ID,
          name: LEGAL_E2E_MOCK_USER.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
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
            { module: 'bookings', level: 'manage' },
          ],
        }),
      });
    }

    if (url.includes('/stations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/legal-documents')) {
      return handleLegalDocumentsRoute(route);
    }

    if (url.includes('/bookings')) {
      return handleBookingRoute(route);
    }

    if (url.includes('/api/')) {
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({ data: [] }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: json({}) });
    }

    return route.continue();
  };

  await context.route(LEGAL_E2E_ROUTE_PATTERN, legalFlowRouteHandler);
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

export async function runLifecycleAction(
  page: Page,
  docId: string,
  action:
    | 'submit_review'
    | 'request_changes'
    | 'approve'
    | 'schedule_activation'
    | 'activate_now'
    | 'replace_active',
) {
  await page.getByTestId(`legal-version-actions-${docId}`).click();
  await page.getByTestId(`legal-lifecycle-action-${action}`).click();
  const dialog = page.getByRole('dialog').filter({
    has: page.locator('[data-testid="legal-lifecycle-dialog-body"]'),
  });
  await expect(dialog).toBeVisible();

  if (action === 'request_changes' || action === 'activate_now' || action === 'replace_active') {
    await dialog.locator('textarea').first().fill('E2E Begründung mit ausreichend Zeichen für Validierung.');
  }
  if (action === 'schedule_activation') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const value = tomorrow.toISOString().slice(0, 16);
    await dialog.locator('input[type="datetime-local"]').fill(value);
    await dialog.locator('textarea').first().fill('Geplante Aktivierung für E2E Testlauf.');
  }

  await dialog.getByTestId('legal-lifecycle-dialog-confirm').click();
  await expect(dialog.getByText(/Aktion bestätigt|Action confirmed/i)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('legal-documents-new-version').waitFor({ state: 'visible', timeout: 30_000 });
}

export async function uploadDraftViaWizard(page: Page, versionLabel = '2026-07-e2e') {
  await page.getByTestId('legal-documents-new-version').click();
  const dialog = page.getByTestId('legal-upload-wizard-dialog');
  await expect(dialog).toBeVisible();

  await dialog.locator('#documentType').selectOption('TERMS_AND_CONDITIONS');
  await page.getByTestId('legal-upload-wizard-next').click();
  await expect(dialog.getByTestId('legal-upload-step-version')).toBeVisible();
  await dialog.locator('#versionLabel').fill(versionLabel);
  await page.getByTestId('legal-upload-wizard-next').click();

  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'agb-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 legal e2e'),
  });
  await page.getByTestId('legal-upload-wizard-next').click();

  await expect(page.getByTestId('legal-upload-save-draft')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('legal-upload-save-draft').click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.reload({ waitUntil: 'load' });
  await page.getByTestId('legal-documents-new-version').waitFor({ state: 'visible', timeout: 30_000 });
}

export function getFlowDocuments() {
  return [...state.documents];
}

export function setBookingDocumentsComplete(complete: boolean) {
  state.bookingDocumentsComplete = complete;
}

export function setFlowProfile(profile: LegalFlowProfile) {
  state.profile = profile;
}

export async function legalFlowApiRequest(
  page: Page,
  path: string,
  options?: { method?: string; data?: unknown },
) {
  return page.evaluate(
    async ({ requestPath, method, data }) => {
      const token = localStorage.getItem('synqdrive_token');
      const response = await fetch(requestPath, {
        method: method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { status: response.status, body };
    },
    { requestPath: path, method: options?.method, data: options?.data },
  );
}

export { expect };
