import { expect, test } from '@playwright/test';

import {
  invoiceListItemLocator,
  MAIN_INVOICE_NUMBER,
  navigateToInvoicesView,
  openInvoiceDetail,
  openInvoicesPage,
  resetInvoiceMockState,
  returnToInvoicesList,
} from './invoice-fixtures';

test.describe('Invoice list and detail E2E flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    resetInvoiceMockState();
  });

  test('flows 1–21: list filters, detail actions, PDF, email, payments, timeline', async ({ page }) => {
  test.setTimeout(120_000);
  await openInvoicesPage(page);

  // 1. Rechnungsübersicht öffnen
  await expect(page.getByRole('heading', { name: 'Rechnungen' })).toBeVisible();
  await expect(page.getByTestId('invoice-list')).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Rechnungen durchsuchen' });

  // 2. Nach Rechnungsnummer suchen
  await search.fill(MAIN_INVOICE_NUMBER);
  await expect(invoiceListItemLocator(page, MAIN_INVOICE_NUMBER)).toBeVisible();
  await expect(invoiceListItemLocator(page, '2026-0099')).toHaveCount(0);

  // 3. Nach Kunde suchen
  await search.fill('Anna Schmidt');
  await expect(invoiceListItemLocator(page, MAIN_INVOICE_NUMBER)).toBeVisible();

  // 4. Nach Kennzeichen suchen
  await search.fill('B-AN 42');
  await expect(invoiceListItemLocator(page, MAIN_INVOICE_NUMBER)).toBeVisible();

  // 5. Statusfilter setzen
  await search.fill('');
  await page.getByLabel('Status filtern', { exact: true }).selectOption('ISSUED');
  await expect(invoiceListItemLocator(page, MAIN_INVOICE_NUMBER)).toBeVisible();
  await expect(invoiceListItemLocator(page, '2026-0099')).toHaveCount(0);

  // 6. Dokumentfilter setzen
  await page.getByLabel('Dokumentstatus filtern', { exact: true }).selectOption('missing');
  await expect(invoiceListItemLocator(page, MAIN_INVOICE_NUMBER)).toBeVisible();
  await page.getByLabel('Dokumentstatus filtern', { exact: true }).selectOption('all');

  // 7. Rechnung öffnen
  await page.getByLabel('Status filtern', { exact: true }).selectOption('all');
  await openInvoiceDetail(page, MAIN_INVOICE_NUMBER);
  await expect(page.getByText(MAIN_INVOICE_NUMBER)).toBeVisible();
  await expect(page.getByTestId('invoice-relations-primary')).toBeVisible();

  // 8. Kunde öffnen
  const customerNav = page
    .getByTestId('invoice-relations-primary')
    .getByRole('button', { name: 'Kunde: Anna Schmidt' });
  await expect(customerNav).toBeVisible({ timeout: 15000 });
  await customerNav.click();
  await returnToInvoicesList(page);
  await openInvoiceDetail(page, MAIN_INVOICE_NUMBER);

  // 9. Buchung öffnen
  const bookingNav = page
    .getByTestId('invoice-relations-primary')
    .getByRole('button', { name: 'Buchung: BK-1001' });
  await expect(bookingNav).toBeVisible();
  await bookingNav.click();
  await returnToInvoicesList(page);
  await openInvoiceDetail(page, MAIN_INVOICE_NUMBER);

  // 10. Fahrzeug öffnen
  const vehicleNav = page
    .getByTestId('invoice-relations-primary')
    .getByRole('button', { name: /^Fahrzeug: BMW/ });
  await expect(vehicleNav).toBeVisible({ timeout: 15000 });
  await vehicleNav.click();
  await returnToInvoicesList(page);
  await openInvoiceDetail(page, MAIN_INVOICE_NUMBER);

  // 11. PDF erzeugen
  const documents = page.getByTestId('invoice-documents-section');
  await expect(documents).toBeVisible();
  await documents.getByRole('button', { name: 'PDF erzeugen' }).click();

  // 12. PDF-Status aktualisieren (Polling GENERATING → ACTIVE)
  await expect(documents.getByText('PDF wird erzeugt')).toBeVisible();
  await expect(documents.getByText('rechnung-2026-0042.pdf')).toBeVisible({ timeout: 15000 });

  // 13. PDF-Vorschau öffnen
  const previewPopup = page.waitForEvent('popup');
  await documents.getByRole('button', { name: 'Vorschau' }).click();
  const previewPage = await previewPopup;
  await previewPage.waitForURL(/^blob:/, { timeout: 10000 }).catch(() => undefined);
  await previewPage.close();

  // 14. Rechnung per E-Mail senden
  await documents.getByRole('button', { name: 'Per E-Mail senden' }).click();
  await expect(page.getByRole('heading', { name: 'Rechnung per E-Mail senden' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Rechnung per E-Mail gesendet')).toBeVisible();

  // 15. Versandhistorie prüfen
  await expect(documents.getByText('Versandhistorie')).toBeVisible();
  await expect(documents.getByText('anna.schmidt@example.com').first()).toBeVisible();
  await expect(documents.getByText('SMTP-Verbindung abgebrochen')).toBeVisible();

  // 16. fehlgeschlagenen Versand erneut versuchen
  await documents.getByRole('button', { name: 'Erneut senden' }).click();
  await expect(documents.getByText('Gesendet').first()).toBeVisible();

  // 17. externen Versand erfassen
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('menuitem', { name: /Externen Versand erfassen/ }).click();
  await expect(page.getByText('Als gesendet markiert')).toBeVisible();

  // 18. Teilzahlung erfassen
  const payments = page.getByTestId('invoice-payments-section');
  await payments.getByRole('button', { name: 'Zahlung erfassen' }).click();
  await expect(page.getByRole('heading', { name: 'Zahlung erfassen' })).toBeVisible();
  await page.locator('input[inputmode="decimal"]').fill('40');
  await page.getByRole('button', { name: 'Zahlung buchen' }).click();
  await expect(page.getByText('Zahlung erfasst')).toBeVisible();
  await expect(page.getByText('Teilweise bezahlt').first()).toBeVisible();

  // 19. Restzahlung erfassen
  await payments.getByRole('button', { name: 'Zahlung erfassen' }).click();
  await expect(page.getByRole('heading', { name: 'Zahlung erfassen' })).toBeVisible();
  await page.locator('input[inputmode="decimal"]').fill('60');
  await page.getByRole('button', { name: 'Zahlung buchen' }).click();

  // 20. Status PAID prüfen
  await expect(page.getByText('Bezahlt').first()).toBeVisible({ timeout: 10000 });

  // 21. Timeline prüfen
  await page.getByRole('button', { name: 'Herkunft & Audit' }).click();
  const timeline = page.getByRole('list', { name: 'Rechnungsverlauf' });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText('Rechnung ausgestellt')).toBeVisible();
  await expect(timeline.getByText('PDF erzeugt')).toBeVisible();
  await expect(timeline.getByText('Per E-Mail gesendet')).toBeVisible();
  await expect(timeline.getByText('Externer Versand erfasst')).toBeVisible();
  await expect(timeline.getByText('Vollständig bezahlt')).toBeVisible();
  });
});

test.describe('Invoice edge-case flows', () => {
  test.beforeEach(() => {
    resetInvoiceMockState();
  });

  test('flow 22: invoice without booking can send email when PDF exists', async ({ page }) => {
    await openInvoicesPage(page);
    await openInvoiceDetail(page, '2026-0150');

    const documents = page.getByTestId('invoice-documents-section');
    const sendBtn = documents.getByRole('button', { name: 'Per E-Mail senden' });
    await expect(sendBtn).toBeEnabled();
  });

  test('flow 23: missing customer email shows validation on send', async ({ page }) => {
    await openInvoicesPage(page);
    await openInvoiceDetail(page, '2026-0160');

    const documents = page.getByTestId('invoice-documents-section');
    await documents.getByRole('button', { name: 'Per E-Mail senden' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rechnung per E-Mail senden' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/Empfänger/i)).toHaveValue('');
    await expect(dialog.getByRole('button', { name: 'Senden' })).toBeDisabled();
  });

  test('flow 24: document generation error is surfaced with retry', async ({ page }) => {
    await openInvoicesPage(page);
    await openInvoiceDetail(page, '2026-0175');

    const documents = page.getByTestId('invoice-documents-section');
    await expect(documents.getByText('PDF-Erzeugung fehlgeschlagen')).toBeVisible();
    await expect(documents.getByText('Renderer nicht erreichbar')).toBeVisible();
    await documents.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(documents.getByText('PDF wird erzeugt…')).toBeVisible({ timeout: 10000 });
  });
});
