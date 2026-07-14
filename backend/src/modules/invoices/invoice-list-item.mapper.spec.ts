import {
  customerDisplayName,
  mapInvoiceListItem,
  resolveInvoiceSourceType,
  vehicleDisplayName,
} from './invoice-list-item.mapper';
import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';

describe('invoice-list-item.mapper', () => {
  const baseInvoice = {
    id: 'inv-1',
    type: OrgInvoiceType.OUTGOING_BOOKING,
    status: OrgInvoiceStatus.ISSUED,
    title: 'Buchungsrechnung',
    customerId: 'cust-1',
    vendorId: null,
    vendorName: null,
    bookingId: 'book-99999999-8888-7777-6666-555555555555',
    vehicleId: 'veh-1',
    totalCents: 50000,
    paidCents: 10000,
    outstandingCents: 40000,
    currency: 'EUR',
    invoiceDate: new Date('2026-07-01T00:00:00Z'),
    dueDate: new Date('2026-07-20T00:00:00Z'),
    generatedDocumentId: 'doc-1',
    documentExtractionId: null,
    invoiceNumberDisplay: '2026-0042',
    legacyInvoiceNumber: null,
    invoiceNumber: null,
    sequenceYear: 2026,
    sequenceNumber: 42,
  };

  it('maps display names without UUIDs', () => {
    const dto = mapInvoiceListItem({
      invoice: baseInvoice,
      customer: {
        id: 'cust-1',
        firstName: 'Anna',
        lastName: 'Schmidt',
        company: 'Schmidt AG',
      } as never,
      vehicle: {
        id: 'veh-1',
        make: 'VW',
        model: 'Golf',
        vehicleName: null,
        licensePlate: 'B-AB 123',
      } as never,
    });

    expect(dto.customerDisplayName).toBe('Schmidt AG');
    expect(dto.bookingNumber).toBe('BK-555555');
    expect(dto.vehicleDisplayName).toBe('VW Golf');
    expect(dto.licensePlate).toBe('B-AB 123');
    expect(dto.sourceType).toBe('BOOKING');
  });

  it('prefers person name when no company', () => {
    expect(
      customerDisplayName({
        firstName: 'Max',
        lastName: 'Muster',
        company: null,
      } as never),
    ).toBe('Max Muster');
  });

  it('uses vehicleName when set', () => {
    expect(
      vehicleDisplayName({
        make: 'BMW',
        model: '320d',
        vehicleName: 'Flotte 12',
      } as never),
    ).toBe('Flotte 12');
  });

  it('detects AI upload source type', () => {
    expect(
      resolveInvoiceSourceType({
        ...baseInvoice,
        type: OrgInvoiceType.INCOMING_UPLOADED,
        documentExtractionId: 'ext-1',
      }),
    ).toBe('AI_UPLOAD');
  });
});
