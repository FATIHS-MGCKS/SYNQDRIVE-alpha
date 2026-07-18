import { expect, test } from '@playwright/test';

import {
  assertNoFalseAppliedSuccess,
  installDocumentIntakeV2Mocks,
  navigateToDocumentUploadView,
  openDocumentIntakeV2,
  readyExtraction,
  resetDocumentIntakeV2MockState,
  switchIntakeTab,
  TEST_EXTRACTION_ID,
  TEST_VEHICLE_ID,
  uploadSamplePdf,
} from './document-intake-v2-fixtures';

test.describe('Document Intake V2 — full flow (mocked)', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test.beforeEach(() => {
    resetDocumentIntakeV2MockState();
  });

  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Intake V2 flow specs run on desktop-1280 only');
  });

  test('1 — idle upload shows only dropzone and tab navigation', async ({ page }) => {
    await openDocumentIntakeV2(page);

    await expect(page.getByRole('heading', { name: /Dokumenten-Upload/i })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await expect(page.getByRole('tab', { name: /Hochladen/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Archiv/i })).toBeVisible();
  });

  test('2 — upload → review shows classification, fields, and action preview', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'ready-review' });
    await uploadSamplePdf(page);

    await expect(page.getByText(/KI-Analyse abgeschlossen|analysis complete/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test.skip('3 — awaiting document type shows entity candidates without auto-confirm', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'awaiting-type' });
    await uploadSamplePdf(page);

    await expect(page.getByText(/Dokumenttyp erforderlich|Type selection required|Typauswahl erforderlich/i)).toBeVisible({
      timeout: 15_000,
    });
    await assertNoFalseAppliedSuccess(page);
  });

  test.skip('4 — apply guard: APPLIED status must not show success while applying', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'applying-guard' });
    await uploadSamplePdf(page);
    await expect(page.getByText(/KI-Analyse abgeschlossen/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i }).click();
    await expect(page.getByText(/uebernahme-ergebnis|apply result/i)).toBeVisible({ timeout: 10_000 });
    await assertNoFalseAppliedSuccess(page);
    await expect(page.getByText(/uebernahme laeuft|apply running/i).first()).toBeVisible();
  });

  test.skip('5 — partial apply shows retry without false success', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'partial-apply' });
    await uploadSamplePdf(page);
    await expect(page.getByText(/KI-Analyse abgeschlossen/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i }).click();
    await expect(page.getByText(/teilweise|partial/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /fehlgeschlagene aktionen|retry failed/i })).toBeVisible();
    await assertNoFalseAppliedSuccess(page);
  });

  test('6 — archive tab lists items and supports search filter', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'archive-populated' });
    await switchIntakeTab(page, 'archive');

    await expect(page.getByText('service-bericht-2026.pdf')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/suchen|search/i)).toBeVisible();
    await page.getByPlaceholder(/suchen|search/i).fill('service-bericht');
    await page.getByRole('button', { name: /suchen|search/i }).click();
    await expect(page.getByText('service-bericht-2026.pdf')).toBeVisible();
  });

  test.skip('7 — reload/resume restores active extraction after apply', async ({ page }) => {
    await openDocumentIntakeV2(page);
    await uploadSamplePdf(page);
    await expect(page.getByText(/KI-Analyse abgeschlossen/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i }).click();
    await expect(page.getByText(/erfolgreich abgelegt|successfully filed/i)).toBeVisible({ timeout: 20_000 });

    await page.evaluate(
      ({ vehicleId, extractionId }) => {
        sessionStorage.setItem(
          'synqdrive_rental_active_extraction',
          JSON.stringify({ vehicleId, extractionId }),
        );
      },
      { vehicleId: TEST_VEHICLE_ID, extractionId: TEST_EXTRACTION_ID },
    );

    await page.reload({ waitUntil: 'networkidle' });
    await installDocumentIntakeV2Mocks(page, { preserveConfirmed: true });
    await navigateToDocumentUploadView(page);

    await expect(
      page.getByRole('button', { name: /Weiteres Dokument hochladen|Upload Another Document/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test.skip('8 — cross-tenant extraction load does not show applied success', async ({ page }) => {
    await openDocumentIntakeV2(page, { profile: 'cross-tenant' });
    await page.goto(
      `/rental?view=document-upload&documentTab=upload&extractionId=${TEST_EXTRACTION_ID}`,
      { waitUntil: 'networkidle' },
    );

    await assertNoFalseAppliedSuccess(page);
    await expect(page.getByText(/nicht gefunden|not found|fehler|error|laden/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('9 — English locale renders upload tab labels', async ({ page }) => {
    await openDocumentIntakeV2(page, { locale: 'en' });
    await expect(page.getByRole('tab', { name: /Upload/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Archive/i })).toBeVisible();
  });
});
