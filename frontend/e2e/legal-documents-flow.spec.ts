import { expect, test } from '@playwright/test';

import {
  getFlowDocuments,
  installLegalDocumentsFlowMocks,
  LEGAL_E2E_BOOKING_ID,
  LEGAL_E2E_FOREIGN_ORG_ID,
  LEGAL_E2E_ORG_ID,
  legalFlowApiRequest,
  openLegalDocumentsAdminTab,
  runLifecycleAction,
  setBookingDocumentsComplete,
  uploadDraftViaWizard,
} from './legal-documents-flow-fixtures';

test.describe('Legal Documents — full lifecycle E2E (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Legal flow specs run on desktop-1280 only');
  });

  test('1–7 — Admin upload through activation and supersede', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page);
    await openLegalDocumentsAdminTab(page);

    // 1 — Upload draft
    await uploadDraftViaWizard(page, '2026-07-e2e-draft');
    let draft = getFlowDocuments().find((d) => d.versionLabel === '2026-07-e2e-draft');
    expect(draft?.status).toBe('DRAFT');
    const draftId = draft!.id;

    // 2 — Submit for review, then request changes
    await runLifecycleAction(page, draftId, 'submit_review');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('IN_REVIEW');

    await runLifecycleAction(page, draftId, 'request_changes');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('DRAFT');

    // 3 — Resubmit for review
    await runLifecycleAction(page, draftId, 'submit_review');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('IN_REVIEW');

    // 4 — Approve
    await runLifecycleAction(page, draftId, 'approve');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('APPROVED');

    // 5 — Schedule activation
    await runLifecycleAction(page, draftId, 'schedule_activation');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('SCHEDULED');

    // 6 — Activate (supersedes existing ACTIVE)
    await runLifecycleAction(page, draftId, 'replace_active');
    draft = getFlowDocuments().find((d) => d.id === draftId);
    expect(draft?.status).toBe('ACTIVE');

    // 7 — Old version superseded
    const superseded = getFlowDocuments().find((d) => d.id === 'doc-agb-active');
    expect(superseded?.status).toBe('SUPERSEDED');
    await expect(page.getByText(/Ersetzt|SUPERSEDED/i).first()).toBeVisible();
  });

  test('8 — Booking receives immutable snapshot references', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'historical-snapshot' });
    await openLegalDocumentsAdminTab(page);
    const usage = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/legal-documents/doc-agb-v1/usage`,
    );
    expect(usage.status).toBe(200);
    expect((usage.body as { summary: { frozenSnapshotVersion: string } }).summary.frozenSnapshotVersion).toBe('2026-01');
    expect((usage.body as { references: { data: Array<{ immutable: boolean }> } }).references.data[0].immutable).toBe(true);
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByText('v2026-01').first()).toBeVisible();
    await expect(page.getByText('v2026-07').first()).toBeVisible();
  });

  test('9 — Missing mandatory document blocks pickup', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'pickup-blocked' });
    await openLegalDocumentsAdminTab(page);
    setBookingDocumentsComplete(false);
    const res = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/bookings/${LEGAL_E2E_BOOKING_ID}/handover/pickup`,
      { method: 'POST', data: { documentsAcknowledged: true, odometerKm: 1000, fuelPercent: 80 } },
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('PICKUP_GATE_BLOCKED');
  });

  test('10 — Successful proof allows pickup', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'pickup-allowed' });
    await openLegalDocumentsAdminTab(page);
    setBookingDocumentsComplete(true);
    const res = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/bookings/${LEGAL_E2E_BOOKING_ID}/handover/pickup`,
      { method: 'POST', data: { documentsAcknowledged: true, odometerKm: 1000, fuelPercent: 80 } },
    );
    expect(res.status).toBe(201);
  });

  test('11 — Document delivery creates idempotent evidence', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page);
    await openLegalDocumentsAdminTab(page);
    const payload = {
      customerId: 'cust-1',
      legalDocumentId: 'doc-agb-active',
      generatedDocumentId: 'gen-1',
      documentType: 'TERMS_AND_CONDITIONS',
      versionLabel: '2026-01',
      language: 'de',
      deliveryChannel: 'EMAIL',
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: 'req-e2e-legal-1',
    };
    const first = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/bookings/${LEGAL_E2E_BOOKING_ID}/legal-document-delivery-evidence`,
      { method: 'POST', data: payload },
    );
    expect(first.status).toBe(201);
    const second = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/bookings/${LEGAL_E2E_BOOKING_ID}/legal-document-delivery-evidence`,
      { method: 'POST', data: payload },
    );
    expect(second.status).toBe(200);
  });

  test('12 — Foreign tenant receives no access', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page);
    await openLegalDocumentsAdminTab(page);
    const res = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_FOREIGN_ORG_ID}/legal-documents`,
    );
    expect(res.status).toBe(403);
  });

  test('14 — Parallel activation conflict is shown clearly', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'activation-conflict' });
    await openLegalDocumentsAdminTab(page);
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('legal-documents-new-version').waitFor({ state: 'visible', timeout: 30_000 });

    await runLifecycleAction(page, 'doc-conflict-a', 'activate_now');
    await page.getByTestId('legal-version-actions-doc-conflict-b').click();
    await page.getByTestId('legal-lifecycle-action-replace_active').click();
    const dialog = page.getByRole('dialog').filter({
      has: page.locator('[data-testid="legal-lifecycle-dialog-body"]'),
    });
    await dialog.locator('textarea').first().fill('E2E Begründung mit ausreichend Zeichen für Validierung.');
    await dialog.getByTestId('legal-lifecycle-dialog-confirm').click();
    await expect(
      dialog.getByText(/bereits aktiv|already active|Konflikt|conflict/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('15 — Scan or integrity error is displayed', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'scan-failed' });
    await openLegalDocumentsAdminTab(page);
    await expect(page.getByText(/Blockiert|blocked|Scan/i).first()).toBeVisible();

    await installLegalDocumentsFlowMocks(page, { profile: 'integrity-failed' });
    await page.reload();
    await openLegalDocumentsAdminTab(page);
    await expect(page.getByText(/Integrität|integrity|CHECKSUM|Prüfsumme/i).first()).toBeVisible();
  });

  test('16 — Historical booking keeps old version in usage', async ({ page }) => {
    await installLegalDocumentsFlowMocks(page, { profile: 'historical-snapshot' });
    await openLegalDocumentsAdminTab(page);
    const usage = await legalFlowApiRequest(
      page,
      `/api/v1/organizations/${LEGAL_E2E_ORG_ID}/legal-documents/doc-agb-v1/usage`,
    );
    expect(usage.status).toBe(200);
    expect((usage.body as { summary: { frozenSnapshotVersion: string } }).summary.frozenSnapshotVersion).toBe('2026-01');
    expect((usage.body as { references: { data: Array<{ immutable: boolean }> } }).references.data[0].immutable).toBe(true);
  });
});
