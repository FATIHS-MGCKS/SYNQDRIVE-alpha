/**
 * Frontend invoice baseline fixtures — mirror backend audit IDs.
 */
import type { Invoice, InvoicePayment } from './invoiceTypes';

export const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const CUSTOMER_MUELLER = 'c3d4e5f6-1111-4222-8333-444455556666';
export const VEHICLE_GOLF = 'v7e8f9a0-2222-4333-8444-555566667777';
export const BOOKING_REF = 'd8e9f0a1-3333-4444-8555-666677778888';
export const INVOICE_BOOKING = 'e9f0a1b2-4444-4555-8666-777788889999';
export const DOC_BOOKING_INVOICE = 'a1b2c3d4-6666-4777-8888-999900001111';

export const BOOKING_NUMBER = `BK-${BOOKING_REF.slice(-6).toUpperCase()}`;

export function bookingInvoiceTitle(): string {
  return `Buchungsrechnung · ${BOOKING_NUMBER}`;
}

export function unpaidOutgoingTaskTitleIssued(): string {
  return 'Zahlungseingang prüfen · Rechnung FSM-2026-0042';
}

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_BOOKING,
    invoiceNumber: null,
    invoiceNumberDisplay: 'FSM-2026-0042',
    type: 'OUTGOING_BOOKING',
    customerId: CUSTOMER_MUELLER,
    vendorId: null,
    vendorName: null,
    bookingId: BOOKING_REF,
    vehicleId: VEHICLE_GOLF,
    title: bookingInvoiceTitle(),
    description: 'Mietrechnung',
    lineItems: null,
    subtotalCents: 45000,
    taxCents: 8550,
    totalCents: 53550,
    paidCents: 53550,
    outstandingCents: 0,
    currency: 'EUR',
    invoiceDate: '2026-07-10T10:00:00.000Z',
    dueDate: '2026-07-24T10:00:00.000Z',
    status: 'PAID',
    templateId: null,
    imageUrl: null,
    extractedData: null,
    documentExtractionId: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: '2026-07-10T11:00:00.000Z',
    issuedAt: '2026-07-10T10:05:00.000Z',
    sentAt: null,
    createdAt: '2026-07-10T10:00:00.000Z',
    tasks: [
      {
        id: 'task-1',
        title: unpaidOutgoingTaskTitleIssued(),
        status: 'DONE',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        amountCents: 53550,
        method: 'CARD',
        paidAt: '2026-07-10T11:00:00.000Z',
      } satisfies InvoicePayment,
    ],
    ...overrides,
  };
}

/** Mirrors InvoicesView canEmailDocument guard (extracted for unit testing). */
export function canEmailInvoiceDocument(input: {
  canManageEmail: boolean;
  invoice: Pick<Invoice, 'bookingId' | 'generatedDocumentId' | 'type' | 'status'>;
}): boolean {
  const { canManageEmail, invoice } = input;
  return (
    canManageEmail &&
    Boolean(invoice.bookingId && invoice.generatedDocumentId) &&
    ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'].includes(invoice.type) &&
    invoice.status !== 'DRAFT'
  );
}

/** Mirrors InvoicesView Herkunft derivation (extracted for baseline tests). */
export function deriveInvoiceProvenanceLabel(invoice: {
  type: string;
  documentExtractionId?: string | null;
}): string {
  if (invoice.type === 'OUTGOING_BOOKING') return 'Automatisch (Buchung)';
  if (invoice.type === 'INCOMING_UPLOADED' || invoice.documentExtractionId) {
    return 'Document Extraction';
  }
  return 'Manuell';
}

/** Mirrors payment table rendering (current: raw enum). */
export function formatPaymentMethodForTable(method: string): string {
  return method;
}
