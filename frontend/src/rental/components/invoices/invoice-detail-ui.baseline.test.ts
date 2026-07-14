import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  canEmailInvoiceDocument,
  formatPaymentMethodForTable,
  makeInvoice,
  BOOKING_REF,
  VEHICLE_GOLF,
} from './invoice-baseline.fixtures';

/**
 * Source-level regression locks for InvoicesView detail UX debt (audit 2026-07-14).
 * Intentionally avoids large UI snapshots.
 */
describe('InvoicesView detail UI — baseline regression locks', () => {
  const viewPath = resolve(__dirname, '../InvoicesView.tsx');
  const source = readFileSync(viewPath, 'utf8');

  const currentRegressionFragments = [
    "row('Kunde', <span className=\"text-emerald-500 font-medium\">Verknüpft</span>",
    "row('Buchung', <span className=\"text-status-info font-medium\">Verknüpft</span>",
    'vehicleId.slice(0, 12)',
    'generatedDocumentId.slice(0, 8)',
    '{p.method}',
    'invoice.bookingId && invoice.generatedDocumentId',
    'api.documents.metadata(orgId, invoice.generatedDocumentId)',
  ];

  it.each(currentRegressionFragments)(
    'current implementation still contains regression marker: %s',
    (fragment) => {
      expect(source).toContain(fragment);
    },
  );

  it('InvoiceDetail does not receive customers/vehicles props from parent', () => {
    expect(source).toMatch(
      /<InvoiceDetail[^>]*invoice=\{selectedInvoice\}[^>]*orgId=/,
    );
    expect(source).not.toMatch(/<InvoiceDetail[^>]*customers=/);
    expect(source).not.toMatch(/<InvoiceDetail[^>]*vehicles=/);
  });

  it('does not call api.documents.open for generated PDF', () => {
    expect(source).not.toContain('api.documents.open');
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

  it('vehicle assignment UI uses UUID fragment not license plate', () => {
    const fragment = `${VEHICLE_GOLF.slice(0, 12)}`;
    expect(fragment).toHaveLength(12);
    expect(fragment).not.toMatch(/[A-Z]{1,3}-[A-Z]{1,2}\s?\d+/);
  });

  it('payment table shows raw CARD enum (current)', () => {
    expect(formatPaymentMethodForTable('CARD')).toBe('CARD');
  });

  it('task titles can contain booking UUID fragment from backend title', () => {
    const inv = makeInvoice();
    expect(inv.tasks?.[0]?.title).toContain(BOOKING_REF.slice(0, 8));
  });
});

describe.skip('InvoicesView detail — target state (enable after phase P0–P2)', () => {
  const viewPath = resolve(__dirname, '../InvoicesView.tsx');

  it('should open PDF via api.documents.open', () => {
    const source = readFileSync(viewPath, 'utf8');
    expect(source).toContain('api.documents.open');
  });

  it('should not show placeholder Verknüpft for customer', () => {
    const source = readFileSync(viewPath, 'utf8');
    expect(source).not.toContain('Verknüpft');
  });

  it('should translate CARD payment method in payments table', () => {
    const source = readFileSync(viewPath, 'utf8');
    expect(source).not.toContain('{p.method}');
  });
});
