import { expect, test } from '@playwright/test';

import {
  installLegalDocumentsFlowMocks,
  openLegalDocumentsAdminTab,
  uploadDraftViaWizard,
} from './legal-documents-flow-fixtures';

test.describe('Legal Documents — responsive / mobile upload', () => {
  test('13 — Mobile upload wizard works at 320px', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'mobile-320',
      'Mobile upload scenario runs on mobile-320 project only',
    );

    await installLegalDocumentsFlowMocks(page);
    await openLegalDocumentsAdminTab(page);

    await page.getByTestId('legal-documents-new-version').click();
    const dialog = page.getByTestId('legal-upload-wizard-dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('#documentType').selectOption('TERMS_AND_CONDITIONS');
    await page.getByTestId('legal-upload-wizard-next').click();
    await expect(dialog.getByTestId('legal-upload-step-version')).toBeVisible();
    await dialog.locator('#versionLabel').fill('2026-mobile-upload');
    await page.getByTestId('legal-upload-wizard-next').click();

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'agb-mobile.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 legal mobile e2e'),
    });
    await page.getByTestId('legal-upload-wizard-next').click();

    await expect(page.getByTestId('legal-upload-save-draft')).toBeVisible({ timeout: 15_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('Mobile version history list is visible', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-320', 'mobile-320 only');

    await installLegalDocumentsFlowMocks(page);
    await openLegalDocumentsAdminTab(page);
    await expect(page.getByTestId('legal-version-mobile-list-TERMS_AND_CONDITIONS')).toBeVisible();
  });
});
