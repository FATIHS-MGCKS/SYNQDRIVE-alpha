import { beforeEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  buildPaymentSummary,
  buildRecordPaymentPayload,
  invoicePaymentMethodLabel,
  invoicePaymentStatusLabel,
  outstandingAmountInputValue,
  parseAmountInputToCents,
  parseRecordPaymentError,
  sortPaymentsNewestFirst,
  validateRecordPaymentForm,
} from './invoicePayments.mapper';
import type { Invoice, InvoicePayment } from './invoiceTypes';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
  let text = de[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
};

const sampleInvoice = (): Invoice => ({
  id: 'inv-1',
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
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
});

describe('invoicePayments.mapper', () => {
  it('localizes payment methods via i18n keys', () => {
    expect(invoicePaymentMethodLabel('CARD', t)).toBe('Karte');
    expect(invoicePaymentMethodLabel('BANK_TRANSFER', t)).toBe('Überweisung');
    expect(invoicePaymentMethodLabel('CASH', t)).toBe('Barzahlung');
    expect(invoicePaymentMethodLabel('STRIPE', t)).toBe('Stripe');
    expect(invoicePaymentMethodLabel('DIRECT_DEBIT', t)).toBe('Lastschrift');
    expect(invoicePaymentMethodLabel('OTHER', t)).toBe('Sonstiges');
    expect(invoicePaymentMethodLabel('UNKNOWN', t)).toBe('Sonstiges');
  });

  it('prefers API status label when present', () => {
    expect(
      invoicePaymentStatusLabel({ statusKind: 'recorded', statusLabel: 'Anbieter bestätigt' }, t),
    ).toBe('Anbieter bestätigt');
    expect(invoicePaymentStatusLabel({ statusKind: 'provider_confirmed' }, t)).toBe('Anbieter bestätigt');
  });

  it('builds summary from invoice amounts', () => {
    const summary = buildPaymentSummary(sampleInvoice(), t);
    expect(summary.paidCents).toBe(5000);
    expect(summary.outstandingCents).toBe(6900);
    expect(summary.paidFormatted).toContain('50');
    expect(summary.outstandingFormatted).toContain('69');
  });

  it('sorts payments newest first', () => {
    const payments: InvoicePayment[] = [
      { id: 'p1', amountCents: 100, method: 'CASH', paidAt: '2026-07-01T10:00:00Z' },
      { id: 'p2', amountCents: 200, method: 'CARD', paidAt: '2026-07-03T10:00:00Z' },
    ];
    expect(sortPaymentsNewestFirst(payments).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('parses amount input and validates overpayment', () => {
    expect(parseAmountInputToCents('69,00')).toBe(6900);
    expect(outstandingAmountInputValue(6900)).toBe('69.00');
    expect(
      validateRecordPaymentForm({
        amountCents: 7000,
        method: 'CARD',
        outstandingCents: 6900,
        t,
      }),
    ).toBe('Betrag übersteigt den offenen Restbetrag');
    expect(
      validateRecordPaymentForm({ amountCents: null, method: 'CARD', outstandingCents: 6900, t }),
    ).toBe('Bitte einen gültigen Betrag eingeben');
    expect(
      validateRecordPaymentForm({ amountCents: 100, method: '', outstandingCents: 6900, t }),
    ).toBe('Zahlungsart ist erforderlich');
  });

  it('maps backend errors to i18n messages', () => {
    expect(parseRecordPaymentError('Diese Referenz wurde bereits verbucht', t)).toBe(
      'Diese Referenz wurde bereits verbucht',
    );
    expect(parseRecordPaymentError('Ungültiger Betrag', t)).toBe('Bitte einen gültigen Betrag eingeben');
    expect(parseRecordPaymentError('Falsche Währung EUR', t, 'EUR')).toContain('EUR');
  });

  it('builds record payment payload with optional fields', () => {
    const payload = buildRecordPaymentPayload({
      amountCents: 6900,
      method: 'BANK_TRANSFER',
      paidAt: '2026-07-14',
      reference: '  REF-1 ',
      note: '  Notiz ',
    });
    expect(payload.amountCents).toBe(6900);
    expect(payload.method).toBe('BANK_TRANSFER');
    expect(payload.reference).toBe('REF-1');
    expect(payload.note).toBe('Notiz');
    expect(payload.paidAt).toBeTruthy();
  });
});
