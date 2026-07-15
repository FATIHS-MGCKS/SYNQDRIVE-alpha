import { expect, test } from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  assertNoRawTechnicalEnums,
  assertNoVisibleUuids,
  invoiceListItemLocator,
  MAIN_INVOICE_NUMBER,
  openInvoiceDetail,
  openInvoicesPage,
  resetInvoiceMockState,
  saveInvoiceScreenshot,
} from './invoice-fixtures';

const VIEWPORTS_FOR_ARTIFACTS = ['mobile-375', 'desktop-1280'] as const;

test.describe('Invoice responsive acceptance', () => {
  test.beforeEach(() => {
    resetInvoiceMockState();
  });

  test('list view: layout, themes, keyboard focus, screenreader labels', async ({ page }, testInfo) => {
    await openInvoicesPage(page, { theme: 'light' });
    await expect(page.getByTestId('invoice-list')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);
    await assertNoRawTechnicalEnums(page);

    await expect(page.getByRole('searchbox', { name: 'Rechnungen durchsuchen' })).toBeVisible();
    await expect(page.getByLabel('Status filtern', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Dokumentstatus filtern', { exact: true })).toBeVisible();

    if (VIEWPORTS_FOR_ARTIFACTS.includes(testInfo.project.name as (typeof VIEWPORTS_FOR_ARTIFACTS)[number])) {
      await saveInvoiceScreenshot(page, `invoices-list-${testInfo.project.name}-light`, testInfo);
    }

    await page.getByRole('button', { name: 'Design: Hell' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    if (VIEWPORTS_FOR_ARTIFACTS.includes(testInfo.project.name as (typeof VIEWPORTS_FOR_ARTIFACTS)[number])) {
      await saveInvoiceScreenshot(page, `invoices-list-${testInfo.project.name}-dark`, testInfo);
    }

    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT']).toContain(focusedTag);
  });

  test('detail view: no overflow, readable labels, primary action accessibility', async ({ page }, testInfo) => {
    await openInvoicesPage(page);
    await openInvoiceDetail(page, MAIN_INVOICE_NUMBER);

    await expect(page.getByTestId('invoice-detail')).toBeVisible();
    await expect(page.getByTestId('invoice-relations-primary')).toBeVisible();
    await expect(page.getByTestId('invoice-payments-section')).toBeVisible();
    await expect(page.getByTestId('invoice-documents-section')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoVisibleUuids(page);
    await assertNoRawTechnicalEnums(page);

    const documents = page.getByTestId('invoice-documents-section');
    const payments = page.getByTestId('invoice-payments-section');
    await expect(documents.getByRole('button', { name: 'PDF erzeugen' })).toBeVisible();
    await expect(payments.getByRole('button', { name: 'Zahlung erfassen' })).toBeVisible();

    await expect(documents.getByText('Für diese Rechnung wurde noch kein PDF erzeugt.')).toBeVisible();

    if (VIEWPORTS_FOR_ARTIFACTS.includes(testInfo.project.name as (typeof VIEWPORTS_FOR_ARTIFACTS)[number])) {
      await saveInvoiceScreenshot(page, `invoices-detail-${testInfo.project.name}`, testInfo);
    }

    const table = page.locator('[data-testid="invoice-payments-section"] table');
    if (await table.isVisible().catch(() => false)) {
      const box = await table.boundingBox();
      const viewport = page.viewportSize();
      expect(box?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
    }
  });

  test('mobile cards are tappable without clipped actions', async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('mobile-'),
      'Mobile card layout check',
    );

    await openInvoicesPage(page);
    const card = invoiceListItemLocator(page, MAIN_INVOICE_NUMBER);
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(80);

    await card.click();
    await expect(page.getByTestId('invoice-detail')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('desktop table rows remain usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'Desktop table check');

    await openInvoicesPage(page);
    const row = page.locator(`tr[data-testid="invoice-list-item-${MAIN_INVOICE_NUMBER}"]`);
    await expect(row).toBeVisible();

    const cells = row.locator('td');
    const count = await cells.count();
    expect(count).toBeGreaterThan(4);

    await row.click();
    await expect(page.getByTestId('invoice-detail')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
