import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import {
  BOOKING_REF,
  CUSTOMER_MUELLER,
  INVOICE_BOOKING,
  ORG_A,
  VEHICLE_GOLF,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';
import { mapInvoiceDetail } from './invoice-detail.mapper';
import { assertNoUuidPrimaryDisplay } from './invoice-detail-relations.util';

describe('invoice-detail.mapper', () => {
  const baseRow = makeOrgInvoiceRow();

  it('maps invoice core fields with display number and direction', () => {
    const dto = mapInvoiceDetail({
      invoice: baseRow as never,
      customer: {
        id: CUSTOMER_MUELLER,
        firstName: 'Max',
        lastName: 'Müller',
        company: null,
        email: 'max@example.com',
        phone: '+49123',
        status: 'ACTIVE',
        customerType: 'INDIVIDUAL',
        archivedAt: null,
      } as never,
      vehicle: {
        id: VEHICLE_GOLF,
        make: 'VW',
        model: 'Golf',
        year: 2024,
        licensePlate: 'B-XY 123',
        vin: 'VIN123',
        vehicleName: null,
        status: 'AVAILABLE',
      } as never,
      booking: {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        status: 'CONFIRMED',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-13T18:00:00.000Z'),
        pickupStationId: 'st-1',
        returnStationId: null,
        pickupStation: { id: 'st-1', name: 'Zentrum', code: 'ZEN' },
        returnStation: null,
      },
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });

    expect(dto.invoice.id).toBe(INVOICE_BOOKING);
    expect(dto.customer?.displayName).toBe('Max Müller');
    expect(dto.customer?.customerNumber).toMatch(/^K-/);
    expect(dto.booking?.bookingNumber).toMatch(/^BK-/);
    expect(dto.booking?.pickupStation?.name).toBe('Zentrum');
    expect(dto.vehicle?.displayName).toContain('Golf');
    assertNoUuidPrimaryDisplay(dto.customer!.displayName);
    assertNoUuidPrimaryDisplay(dto.vehicle!.displayName);
    expect(dto.relations.customerDiverges).toBe(false);
  });

  it('maps OUTGOING_FINAL provenance as booking final not manual', () => {
    const dto = mapInvoiceDetail({
      invoice: makeOrgInvoiceRow({
        type: OrgInvoiceType.OUTGOING_FINAL,
        status: OrgInvoiceStatus.DRAFT,
      }) as never,
      customer: null,
      vehicle: null,
      booking: null,
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });
    expect(dto.provenance.kind).toBe('BOOKING_FINAL');
  });

  it('exposes customer divergence when booking customer differs', () => {
    const dto = mapInvoiceDetail({
      invoice: baseRow as never,
      customer: {
        id: CUSTOMER_MUELLER,
        firstName: 'A',
        lastName: 'B',
        company: null,
        email: null,
        phone: null,
        status: 'ACTIVE',
        customerType: 'INDIVIDUAL',
        archivedAt: null,
      } as never,
      vehicle: null,
      booking: {
        id: BOOKING_REF,
        customerId: 'other-customer',
        status: 'CONFIRMED',
        startDate: new Date(),
        endDate: new Date(),
        pickupStationId: null,
        returnStationId: null,
      },
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });
    expect(dto.relations.customerDiverges).toBe(true);
  });

  it('returns null booking and vehicle when invoice has no links', () => {
    const dto = mapInvoiceDetail({
      invoice: makeOrgInvoiceRow({
        bookingId: null,
        vehicleId: null,
        customerId: null,
      }) as never,
      customer: null,
      vehicle: null,
      booking: null,
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });
    expect(dto.booking).toBeNull();
    expect(dto.vehicle).toBeNull();
    expect(dto.customer).toBeNull();
  });
});
