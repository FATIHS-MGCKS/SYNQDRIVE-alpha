import { describe, expect, it } from 'vitest';

import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import {
  buildInvoiceDetailSecondaryPanel,
  sanitizeTaskTitle,
  SECONDARY_EMPTY_CARD_REDUCTION,
} from './invoiceDetailSecondary.mapper';
import type { Invoice } from './invoiceTypes';

const sampleInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: 'FSM-2026-0001',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-1',
  vendorId: null,
  vendorName: null,
  bookingId: 'book-1',
  vehicleId: 'veh-1',
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
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

describe('invoiceDetailSecondary.mapper', () => {
  it('strips UUIDs from task titles', () => {
    expect(
      sanitizeTaskTitle('Zahlung prüfen 11111111-2222-4333-8444-555555555555'),
    ).toBe('Zahlung prüfen');
    expect(sanitizeTaskTitle('  ')).toBe('Aufgabe');
  });

  it('hides more-info when no description, notes, or edit permission', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice({ status: 'ISSUED' }), {
      canManageEmail: true,
    });
    const panel = buildInvoiceDetailSecondaryPanel(
      sampleInvoice({ notes: '', description: '' }),
      detail.relations.provenance,
      detail.actions.edit,
    );
    expect(panel.showMoreInfo).toBe(false);
  });

  it('shows more-info when edit allowed on draft', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice({ status: 'DRAFT' }), {
      canManageEmail: true,
    });
    const panel = buildInvoiceDetailSecondaryPanel(
      sampleInvoice({ status: 'DRAFT', notes: '', description: '' }),
      detail.relations.provenance,
      detail.actions.edit,
    );
    expect(panel.showMoreInfo).toBe(true);
    expect(panel.canEditNotes).toBe(true);
  });

  it('groups tasks with done/open counts', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice(), { canManageEmail: true });
    const panel = buildInvoiceDetailSecondaryPanel(
      sampleInvoice({
        tasks: [
          { id: 't1', title: 'Offen', status: 'OPEN' },
          { id: 't2', title: 'Fertig', status: 'DONE' },
        ],
      }),
      detail.relations.provenance,
      detail.actions.edit,
    );
    expect(panel.showTasks).toBe(true);
    expect(panel.openTaskCount).toBe(1);
    expect(panel.doneTaskCount).toBe(1);
  });

  it('documents empty card reduction metric', () => {
    expect(SECONDARY_EMPTY_CARD_REDUCTION.removedSurfaces).toBe(4);
  });
});
