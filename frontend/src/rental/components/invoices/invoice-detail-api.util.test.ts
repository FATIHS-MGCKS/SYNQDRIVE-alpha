import { describe, expect, it } from 'vitest';

import { BOOKING_REF, CUSTOMER_MUELLER, INVOICE_BOOKING, VEHICLE_GOLF } from './invoice-baseline.fixtures';
import { normalizeInvoiceDetailFromApi } from './invoice-detail-api.util';

describe('normalizeInvoiceDetailFromApi', () => {
  it('flattens nested detail DTO and preserves relation summaries', () => {
    const flat = normalizeInvoiceDetailFromApi({
      invoice: {
        id: INVOICE_BOOKING,
        invoiceNumber: 'FSM-2026-0042',
        legacyInvoiceNumber: 42,
        type: 'OUTGOING_BOOKING',
        status: 'PAID',
        title: 'Test',
        description: '',
        currency: 'EUR',
        invoiceDate: '2026-07-10T10:00:00.000Z',
        issueDate: null,
        dueDate: null,
        sentAt: null,
        paidAt: null,
        createdAt: '2026-07-10T10:00:00.000Z',
        generatedDocumentId: 'doc-1',
        activeDocumentId: 'doc-1',
        documentCacheMismatch: false,
        documentExtractionId: null,
        imageUrl: null,
      },
      amounts: {
        subtotalNetCents: 100,
        taxTotalCents: 19,
        totalGrossCents: 119,
        paidAmountCents: 119,
        outstandingAmountCents: 0,
      },
      customer: {
        id: CUSTOMER_MUELLER,
        availability: 'AVAILABLE',
        displayName: 'Anna Schmidt',
        navigation: null,
      },
      supplier: null,
      booking: {
        id: BOOKING_REF,
        availability: 'AVAILABLE',
        displayName: 'BK-778888',
        bookingNumber: 'BK-778888',
        reference: 'D8E9F0A1',
        startDate: '2026-07-10T08:00:00.000Z',
        endDate: '2026-07-13T18:00:00.000Z',
        status: 'CONFIRMED',
        navigation: null,
      },
      vehicle: {
        id: VEHICLE_GOLF,
        availability: 'AVAILABLE',
        displayName: 'VW Golf (M-AB 100)',
        navigation: null,
      },
      relations: {
        customerDiverges: false,
        invoiceCustomerId: CUSTOMER_MUELLER,
        bookingCustomerId: CUSTOMER_MUELLER,
        message: null,
      },
      lineItems: [],
      payments: [],
      documents: [],
      linkedTasks: [],
      notes: '',
      provenance: { kind: 'BOOKING_AUTOMATIC', label: 'Automatisch (Buchung)' },
      timeline: [],
      capabilities: undefined,
    });

    expect(flat.invoiceNumberDisplay).toBe('FSM-2026-0042');
    expect(flat.customer?.displayName).toBe('Anna Schmidt');
    expect(flat.booking?.bookingNumber).toBe('BK-778888');
    expect(flat.vehicle?.displayName).toBe('VW Golf (M-AB 100)');
    expect(flat.generatedDocumentId).toBe('doc-1');
  });
});
