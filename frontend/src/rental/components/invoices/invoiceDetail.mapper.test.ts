import { describe, expect, it } from 'vitest';

import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import type { Invoice } from './invoiceTypes';
import {
  primaryActionsGridClass,
  resolveInvoiceHeaderLayoutMode,
} from './invoiceDetailHeader.layout';

const sampleInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-internal-uuid',
  invoiceNumber: 42,
  invoiceNumberDisplay: 'FSM-2026-0042',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-1',
  vendorId: null,
  vendorName: null,
  bookingId: 'bk-1',
  vehicleId: null,
  title: 'Mietrechnung',
  description: '',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 0,
  outstandingCents: 11900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  generatedDocumentId: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('buildInvoiceDetailDto', () => {
  it('exposes localized amounts and dates without raw UUID in display fields', () => {
    const dto = buildInvoiceDetailDto(sampleInvoice(), { canManageEmail: true });
    expect(dto.core.invoiceNumberDisplay).toBe('FSM-2026-0042');
    expect(dto.core.invoiceNumberDisplay).not.toContain('inv-internal');
    expect(dto.amounts.totalFormatted).toMatch(/119/);
    expect(dto.amounts.invoiceDateFormatted).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(dto.amounts.dueDateFormatted).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('allows PDF view when generated document exists', () => {
    const dto = buildInvoiceDetailDto(
      sampleInvoice({ generatedDocumentId: 'doc-1' }),
      { canManageEmail: true },
    );
    expect(dto.primary.viewPdf.allowed).toBe(true);
    expect(dto.primary.generatePdf.allowed).toBe(false);
  });

  it('blocks email for non-admin with visible reason', () => {
    const dto = buildInvoiceDetailDto(
      sampleInvoice({ generatedDocumentId: 'doc-1' }),
      { canManageEmail: false },
    );
    expect(dto.primary.sendEmail.allowed).toBe(false);
    expect(dto.primary.sendEmail.reason).toContain('Administratoren');
  });

  it('requires issue before generate on draft booking invoices', () => {
    const dto = buildInvoiceDetailDto(sampleInvoice({ status: 'DRAFT' }), { canManageEmail: true });
    expect(dto.primary.generatePdf.allowed).toBe(false);
    expect(dto.primary.generatePdf.reason).toContain('ausstellen');
    expect(dto.actions.issue.allowed).toBe(true);
  });
});

describe('invoice detail header responsive layout', () => {
  it('uses compact layout at 320px', () => {
    expect(resolveInvoiceHeaderLayoutMode(320)).toBe('compact');
    expect(primaryActionsGridClass('compact')).toContain('grid-cols-2');
  });

  it('uses comfortable layout at 375px and 390px', () => {
    expect(resolveInvoiceHeaderLayoutMode(375)).toBe('comfortable');
    expect(resolveInvoiceHeaderLayoutMode(390)).toBe('comfortable');
  });

  it('uses desktop layout at wide viewports', () => {
    expect(resolveInvoiceHeaderLayoutMode(1280)).toBe('desktop');
    expect(primaryActionsGridClass('desktop')).toContain('justify-end');
  });
});
