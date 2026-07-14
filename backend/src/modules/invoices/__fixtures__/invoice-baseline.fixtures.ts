/**
 * Deterministic fixtures for invoice baseline / regression tests.
 * IDs resemble production UUIDs but are fixed for reproducibility.
 */
import { InvoicePaymentMethod, OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';

export const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const ORG_B = 'b2c821d0-7ea2-4180-b8fe-a02eddde25b';

export const CUSTOMER_MUELLER = 'c3d4e5f6-1111-4222-8333-444455556666';
export const VEHICLE_GOLF = 'v7e8f9a0-2222-4333-8444-555566667777';
export const BOOKING_REF = 'd8e9f0a1-3333-4444-8555-666677778888';

export const INVOICE_BOOKING = 'e9f0a1b2-4444-4555-8666-777788889999';
export const INVOICE_MANUAL = 'f0a1b2c3-5555-4666-8777-888899990000';

export const DOC_BOOKING_INVOICE = 'a1b2c3d4-6666-4777-8888-999900001111';

export const BOOKING_REF_SHORT = BOOKING_REF.slice(0, 8); // 'd8e9f0a1'

export function bookingInvoiceTitle(): string {
  return `Buchungsrechnung #${BOOKING_REF_SHORT}`;
}

export function makeOrgInvoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_BOOKING,
    organizationId: ORG_A,
    type: OrgInvoiceType.OUTGOING_BOOKING,
    status: OrgInvoiceStatus.ISSUED,
    customerId: CUSTOMER_MUELLER,
    vendorId: null,
    vendorName: null,
    bookingId: BOOKING_REF,
    vehicleId: VEHICLE_GOLF,
    title: bookingInvoiceTitle(),
    description: 'Mietrechnung Testzeitraum',
    lineItems: [
      {
        description: 'Fahrzeugmiete (3 Tage)',
        quantity: 3,
        unitPriceNetCents: 15000,
        taxRate: 19,
        netCents: 45000,
        taxCents: 8550,
        grossCents: 53550,
      },
    ],
    subtotalCents: 45000,
    taxCents: 8550,
    totalCents: 53550,
    paidCents: 0,
    outstandingCents: 53550,
    currency: 'EUR',
    invoiceDate: new Date('2026-07-10T10:00:00.000Z'),
    dueDate: new Date('2026-07-24T10:00:00.000Z'),
    invoiceNumber: null,
    legacyInvoiceNumber: null,
    invoiceNumberDisplay: 'FSM-2026-0042',
    sequenceYear: 2026,
    sequenceNumber: 42,
    templateId: null,
    imageUrl: null,
    extractedData: null,
    documentExtractionId: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: null,
    issuedAt: new Date('2026-07-10T10:05:00.000Z'),
    sentAt: null,
    cancelledAt: null,
    voidedAt: null,
    creditedAt: null,
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:05:00.000Z'),
    creationChannel: null,
    sourceType: null,
    sourceId: null,
    createdByUserId: null,
    triggeredByType: null,
    automationId: null,
    correlationId: null,
    tasks: [],
    payments: [],
    vendor: null,
    ...overrides,
  };
}

export function makeGeneratedBookingInvoiceDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOC_BOOKING_INVOICE,
    organizationId: ORG_A,
    documentType: 'BOOKING_INVOICE',
    origin: 'GENERATED',
    status: 'GENERATED',
    bookingId: BOOKING_REF,
    customerId: CUSTOMER_MUELLER,
    vehicleId: VEHICLE_GOLF,
    invoiceId: INVOICE_BOOKING,
    title: `Buchungsrechnung · ${BOOKING_REF_SHORT}`,
    documentNumber: 'RE-2026-0042',
    fileName: `booking_invoice-${BOOKING_REF_SHORT}.pdf`,
    mimeType: 'application/pdf',
    objectKey: `organizations/${ORG_A}/bookings/${BOOKING_REF}/BOOKING_INVOICE/2026/07/${DOC_BOOKING_INVOICE}.pdf`,
    ...overrides,
  };
}

export function makeCardPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pay-card-001',
    organizationId: ORG_A,
    invoiceId: INVOICE_BOOKING,
    amountCents: 53550,
    method: InvoicePaymentMethod.CARD,
    paidAt: new Date('2026-07-10T11:00:00.000Z'),
    reference: null,
    note: 'Buchungsbestätigung — Vorauszahlung',
    createdByUserId: 'user-op-1',
    createdAt: new Date('2026-07-10T11:00:00.000Z'),
    ...overrides,
  };
}

export function makeBookingPriceSnapshot() {
  return {
    id: 'snap-001',
    organizationId: ORG_A,
    bookingId: BOOKING_REF,
    currency: 'EUR',
    totalGrossCents: 53550,
    subtotalNetCents: 45000,
    taxRatePercent: 19,
    rentalDays: 3,
    lineItems: [
      {
        type: 'RENTAL',
        label: 'Fahrzeugmiete (3 Tage)',
        quantity: 3,
        totalNetCents: 45000,
        taxRatePercent: 19,
        sortOrder: 0,
      },
    ],
  };
}
