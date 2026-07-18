import { expect, test } from '@playwright/test';
import {
  installDocumentUploadMocks,
  navigateToDocumentUploadView,
  openDocumentUpload,
  readyExtraction,
  resetDocumentUploadMockState,
  TEST_EXTRACTION_ID,
  TEST_VEHICLE_ID,
} from './document-upload-fixtures';

async function uploadSamplePdf(page: import('@playwright/test').Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'service-bericht-2026.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  });
}

test.describe('Document upload lifecycle E2E (mocked Mistral)', () => {
  test.beforeEach(() => {
    resetDocumentUploadMockState();
  });

  test('full flow: upload → review → confirm → apply → reload recovery', async ({ page }) => {
    await openDocumentUpload(page);
    await uploadSamplePdf(page);

    await expect(page.getByText('KI-Analyse abgeschlossen')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(readyExtraction.extractedData.workshopName)).toBeVisible();

    await page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i }).click();
    await expect(page.getByText(/uebernahme-ergebnis|apply result/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/erfolgreich abgelegt|successfully filed/i)).toBeVisible({ timeout: 15_000 });

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
    await installDocumentUploadMocks(page, { preserveConfirmed: true });
    await navigateToDocumentUploadView(page);

    await expect(page.getByRole('heading', { name: 'Dokumenten-Upload' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Weiteres Dokument hochladen|Upload Another Document/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
