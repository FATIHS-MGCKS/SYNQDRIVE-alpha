import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  canEmailInvoiceDocument,
  formatPaymentMethodForTable,
  makeInvoice,
  BOOKING_NUMBER,
  unpaidOutgoingTaskTitleIssued,
  VEHICLE_GOLF,
} from './invoice-baseline.fixtures';
import { resolveLinkedDocumentLabel } from './invoice-display.util';

describe('InvoicesView detail UI — relation summaries from getDetail', () => {
  const viewPath = resolve(__dirname, '../InvoicesView.tsx');
  const source = readFileSync(viewPath, 'utf8');

  it('loads detail via api.invoices.getDetail', () => {
    expect(source).toContain('api.invoices.getDetail');
    expect(source).toContain('normalizeInvoiceDetailFromApi');
  });

  it('does not show placeholder Verknüpft for customer or booking', () => {
    expect(source).not.toContain('Verknüpft</span>, User)');
    expect(source).not.toContain('Verknüpft</span>, Calendar)');
  });

  it('does not use vehicleId UUID fragment as primary vehicle label', () => {
    expect(source).not.toContain('vehicleId.slice(0, 12)');
  });

  it('does not use generatedDocumentId UUID fragment in source', () => {
    expect(source).not.toContain('generatedDocumentId.slice');
  });

  it('does not use documentExtractionId UUID fragment in source', () => {
    expect(source).not.toContain('documentExtractionId.slice');
  });

  it('uses resolveLinkedDocumentLabel for document display', () => {
    expect(source).toContain('resolveLinkedDocumentLabel');
  });

  it('renders resolved customer, booking and vehicle display names', () => {
    expect(source).toContain('customerLabel');
    expect(source).toContain('bookingLabel');
    expect(source).toContain('vehicleLabel');
    expect(source).toContain('invoice.customer?.displayName');
    expect(source).toContain('invoice.booking?.bookingNumber');
    expect(source).toContain('invoice.vehicle?.displayName');
  });

  it('shows customer divergence message when relations diverge', () => {
    expect(source).toContain('invoice.relations?.customerDiverges');
    expect(source).toContain('invoice.relations.message');
  });

  it('InvoiceDetail does not receive customers/vehicles props from parent', () => {
    expect(source).toMatch(
      /<InvoiceDetail[^>]*invoice=\{selectedInvoice\}[^>]*orgId=/,
    );
    expect(source).not.toMatch(/<InvoiceDetail[^>]*customers=/);
    expect(source).not.toMatch(/<InvoiceDetail[^>]*vehicles=/);
  });
});

describe('InvoicesView detail — behavioral baseline helpers', () => {
  it('canEmailInvoiceDocument requires bookingId AND generatedDocumentId', () => {
    const base = makeInvoice({ status: 'ISSUED', generatedDocumentId: null });
    expect(
      canEmailInvoiceDocument({ canManageEmail: true, invoice: base }),
    ).toBe(false);

    expect(
      canEmailInvoiceDocument({
        canManageEmail: true,
        invoice: { ...base, generatedDocumentId: 'doc-1' },
      }),
    ).toBe(true);

    expect(
      canEmailInvoiceDocument({
        canManageEmail: true,
        invoice: { ...base, bookingId: null, generatedDocumentId: 'doc-1' },
      }),
    ).toBe(false);
  });

  it('canEmailInvoiceDocument is admin-gated in UI', () => {
    const inv = makeInvoice({ status: 'ISSUED', generatedDocumentId: 'doc-1' });
    expect(canEmailInvoiceDocument({ canManageEmail: false, invoice: inv })).toBe(false);
  });

  it('payment table shows raw CARD enum (current)', () => {
    expect(formatPaymentMethodForTable('CARD')).toBe('CARD');
  });

  it('task titles use business references from backend', () => {
    const inv = makeInvoice();
    expect(inv.tasks?.[0]?.title).toBe(unpaidOutgoingTaskTitleIssued());
    expect(inv.tasks?.[0]?.title).not.toMatch(/#[0-9a-f]{8}/i);
  });

  it('resolveLinkedDocumentLabel prefers filename over ids', () => {
    const label = resolveLinkedDocumentLabel({
      generatedDocumentId: 'doc-1',
      activeDocumentId: 'doc-1',
      invoiceNumberDisplay: 'FSM-2026-0042',
      documents: [{ id: 'doc-1', filename: 'booking_invoice-BK-778888.pdf' }],
      booking: { id: 'b1', bookingNumber: BOOKING_NUMBER } as never,
    });
    expect(label).toBe('booking_invoice-BK-778888.pdf');
  });
});

describe.skip('InvoicesView detail — future improvements', () => {
  const viewPath = resolve(__dirname, '../InvoicesView.tsx');

  it('should open PDF via api.documents.open', () => {
    const source = readFileSync(viewPath, 'utf8');
    expect(source).toContain('api.documents.open');
  });

  it('should translate CARD payment method in payments table', () => {
    const source = readFileSync(viewPath, 'utf8');
    expect(source).not.toContain('{p.method}');
  });
});
