// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  buildPaymentSummary,
  buildRecordPaymentPayload,
  formatPaymentAmount,
  formatPaymentRowDate,
  parseAmountInputToCents,
  sortPaymentsNewestFirst,
} from './invoices/invoicePayments.mapper';
import { InvoicePayments } from './invoices/InvoicePayments';
import { RecordPaymentDialog } from './invoices/RecordPaymentDialog';
import { InvoicePaymentDetailDialog } from './invoices/InvoicePaymentDetailDialog';
import type { Invoice, InvoicePayment } from './invoices/invoiceTypes';

const P252_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoicePayments.tsx',
  'rental/components/invoices/InvoicePaymentDetailDialog.tsx',
  'rental/components/invoices/RecordPaymentDialog.tsx',
  'rental/components/invoices/invoicePayments.mapper.ts',
  'rental/lib/rental-invoice-payments-i18n.ts',
];

const REFERENCE = 'PAY-X7-00421';
const NOTE = 'Sondertext X7';
const PROVIDER_ERROR = 'PAYMENT_PROVIDER_ERROR_X7';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

function isP252EnforceCleanPath(relPath: string): boolean {
  return P252_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function sampleInvoice(): Invoice {
  return {
    id: 'inv-p252',
    invoiceNumber: 1,
    invoiceNumberDisplay: 'FSM-2026-0001',
    type: 'OUTGOING_MANUAL',
    customerId: null,
    vendorId: null,
    vendorName: null,
    bookingId: null,
    vehicleId: null,
    title: 'Test',
    description: '',
    lineItems: null,
    subtotalCents: 10000,
    taxCents: 1900,
    totalCents: 11900,
    paidCents: 5000,
    outstandingCents: 6900,
    currency: 'EUR',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'PARTIALLY_PAID',
    templateId: null,
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
  };
}

const payments: InvoicePayment[] = [
  {
    id: 'pay-older',
    amountCents: 2000,
    method: 'CARD',
    paidAt: '2026-07-01T10:00:00Z',
    reference: REFERENCE,
    note: NOTE,
    statusKind: 'recorded',
    statusLabel: PROVIDER_ERROR,
    createdByName: 'Maria Admin',
  },
  {
    id: 'pay-newer',
    amountCents: 3000,
    method: 'BANK_TRANSFER',
    paidAt: '2026-07-03T10:00:00Z',
    reference: 'STRIPE-PI-X7-729',
    statusKind: 'provider_confirmed',
    createdByName: 'System User',
    isProviderBacked: true,
  },
];

function SameMountPaymentsApp() {
  const { locale, setLocale } = useLanguage();
  const [recordOpen, setRecordOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>('pay-newer');
  const [amountInput, setAmountInput] = useState('42,00');
  const [method, setMethod] = useState('CARD');
  const [paidAt, setPaidAt] = useState('2026-07-10');
  const [reference, setReference] = useState(REFERENCE);
  const [note, setNote] = useState(NOTE);

  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      'data-testid': 'locale-de',
      onClick: () => setLocale('de'),
    }, 'DE'),
    createElement('button', {
      type: 'button',
      'data-testid': 'locale-en',
      onClick: () => setLocale('en'),
    }, 'EN'),
    createElement(InvoicePayments, {
      invoice: sampleInvoice(),
      payments,
      recordGate: { allowed: true, reason: undefined },
      recordDialogOpen: recordOpen,
      onRecordDialogOpenChange: setRecordOpen,
      amountInput,
      method,
      paidAt,
      reference,
      note,
      recording: false,
      detailPaymentId: detailId,
      onDetailPaymentIdChange: setDetailId,
      onAmountInputChange: setAmountInput,
      onMethodChange: setMethod,
      onPaidAtChange: setPaidAt,
      onReferenceChange: setReference,
      onNoteChange: setNote,
      onOpenRecordDialog: () => setRecordOpen(true),
      onSubmitRecord: () => undefined,
      ...theme,
    }),
  );
}

describe('P2.2.52 rental invoice payments localization', () => {
  it('has zero P252 enforce-clean scanner debt', () => {
    const scoped = inventory.findings.filter((f) => isP252EnforceCleanPath(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('formats money and dates differently per locale without changing raw cents', () => {
    const invoice = sampleInvoice();
    const deSummary = buildPaymentSummary(invoice, (k) => k, 'de');
    const enSummary = buildPaymentSummary(invoice, (k) => k, 'en');
    expect(deSummary.paidCents).toBe(5000);
    expect(enSummary.paidCents).toBe(5000);
    expect(deSummary.outstandingCents).toBe(6900);
    expect(enSummary.outstandingCents).toBe(6900);
    expect(deSummary.paidFormatted).not.toBe(enSummary.paidFormatted);
    expect(formatPaymentAmount(5000, 'EUR', 'de')).not.toBe(formatPaymentAmount(5000, 'EUR', 'en'));
    expect(formatPaymentRowDate('2026-07-10T08:00:00.000Z', 'de')).toBeTruthy();
    expect(formatPaymentRowDate('2026-07-10T08:00:00.000Z', 'en')).toBeTruthy();
  });

  it('preserves payment order and raw fields across locales', () => {
    const sorted = sortPaymentsNewestFirst(payments);
    expect(sorted.map((p) => p.id)).toEqual(['pay-newer', 'pay-older']);
    expect(sorted[0].amountCents).toBe(3000);
    expect(sorted[0].method).toBe('BANK_TRANSFER');
    expect(sorted[0].reference).toBe('STRIPE-PI-X7-729');
    expect(sorted[1].statusLabel).toBe(PROVIDER_ERROR);
    expect(sorted[1].note).toBe(NOTE);
  });

  it('builds unchanged record payment payload from fixture', () => {
    const amountCents = parseAmountInputToCents('42,00');
    expect(amountCents).toBe(4200);
    const payload = buildRecordPaymentPayload({
      amountCents: amountCents!,
      method: 'CARD',
      paidAt: '2026-07-10',
      reference: REFERENCE,
      note: NOTE,
    });
    expect(payload).toEqual({
      amountCents: 4200,
      method: 'CARD',
      paidAt: new Date('2026-07-10T12:00:00').toISOString(),
      reference: REFERENCE,
      note: NOTE,
    });
  });

  it('preserves same-mount list, detail, and record draft across DE↔EN', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(SameMountPaymentsApp)));
    });

    const section = () => container.querySelector('[data-testid="invoice-payments-section"]');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(section()?.textContent).toContain('Zahlungen');
    expect(section()?.textContent).toContain(REFERENCE);
    expect(section()?.textContent).toContain(PROVIDER_ERROR);
    expect(section()?.textContent).toContain('STRIPE-PI-X7-729');

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(section()?.textContent).toContain('Payments');
    expect(section()?.textContent).toContain(REFERENCE);
    expect(section()?.textContent).toContain(PROVIDER_ERROR);

    await act(async () => {
      const recordBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Record payment'),
      );
      recordBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialogRoot = document.body;
    const amountInput = dialogRoot.querySelector('input[inputmode="decimal"]') as HTMLInputElement | null;
    expect(amountInput?.value).toBe('42,00');
    const methodSelect = dialogRoot.querySelector('select') as HTMLSelectElement | null;
    expect(methodSelect?.value).toBe('CARD');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(amountInput?.value).toBe('42,00');
    expect(methodSelect?.value).toBe('CARD');
    expect(dialogRoot.querySelector('input[type="date"]')?.getAttribute('value')).toBe('2026-07-10');

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  it('keeps detail dialog open with same payment on locale switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const payment = payments[1];

    function DetailApp() {
      const { locale, setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }, 'DE'),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }, 'EN'),
        createElement(InvoicePaymentDetailDialog, {
          open: true,
          payment,
          currency: 'EUR',
          onOpenChange: () => undefined,
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(DetailApp)));
    });

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const dialogText = document.body.textContent ?? '';
    expect(dialogText).toContain('Zahlungsdetails');
    expect(dialogText).toContain('STRIPE-PI-X7-729');

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const dialogTextEn = document.body.textContent ?? '';
    expect(dialogTextEn).toContain('Payment details');
    expect(dialogTextEn).toContain('STRIPE-PI-X7-729');

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });
});
