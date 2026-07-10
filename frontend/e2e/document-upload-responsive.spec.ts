import { expect, test, type Page } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  openDocumentUpload,
  readyExtraction,
  resetDocumentUploadMockState,
  TEST_EXTRACTION_ID,
} from './document-upload-fixtures';

async function uploadSamplePdf(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sehr-langer-servicebericht-mit-vielen-zeichen-im-dateinamen-2026.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  });
}

test.describe('Document upload responsive overflow', () => {
  test.beforeEach(() => {
    resetDocumentUploadMockState();
  });

  test('idle state fits the viewport', async ({ page }) => {
    await openDocumentUpload(page);
    await expect(page.getByText('Abgelegt', { exact: true }).locator('visible=true')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dokumenten-Upload' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('queued/processing state fits the viewport', async ({ page }) => {
    await openDocumentUpload(page);
    await page.route('**/document-extractions/*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'POST' && url.includes('/upload')) {
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
      if (method === 'GET' && url.includes(TEST_EXTRACTION_ID)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: TEST_EXTRACTION_ID,
            status: 'PROCESSING',
            documentType: 'SERVICE',
          }),
        });
      }
      return route.continue();
    });

    await uploadSamplePdf(page);
    await expect(
      page.getByText(/In Warteschlange|Wird verarbeitet|warteschlange|queued|processing|extrahier|analysiert|OCR/i).first(),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('ready-for-review state fits the viewport', async ({ page }) => {
    await openDocumentUpload(page);
    await uploadSamplePdf(page);
    await expect(page.getByText('KI-Analyse abgeschlossen')).toBeVisible();
    await expect(page.getByText(readyExtraction.extractedData.workshopName)).toBeVisible();
    await expect(page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('failed state fits the viewport', async ({ page }) => {
    await openDocumentUpload(page);
    await page.route('**/document-extractions/upload', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Upload failed in test.' }),
        });
      }
      return route.continue();
    });

    await uploadSamplePdf(page);
    await expect(page.getByText(/upload failed|extraction failed/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('applied state fits the viewport', async ({ page }) => {
    await openDocumentUpload(page);
    await uploadSamplePdf(page);
    await expect(page.getByText('KI-Analyse abgeschlossen')).toBeVisible();
    await page.getByRole('button', { name: /bestaetigen & ablegen|confirm & file/i }).click();
    await expect(page.getByText(/erfolgreich abgelegt/i)).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('desktop keeps horizontal action buttons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Desktop-only regression check');

    await openDocumentUpload(page);
    await uploadSamplePdf(page);
    await expect(page.getByText('KI-Analyse abgeschlossen')).toBeVisible();

    const actionRow = page.locator('.flex.flex-col.sm\\:flex-row.sm\\:items-center.gap-3.pt-2').first();
    const box = await actionRow.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(500);
    await assertNoHorizontalOverflow(page);
  });
});
