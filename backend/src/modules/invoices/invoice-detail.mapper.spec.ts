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
      } as never,
      vehicle: {
        id: VEHICLE_GOLF,
        make: 'VW',
        model: 'Golf',
        year: 2024,
        licensePlate: 'B-XY 123',
        vin: 'VIN123',
        vehicleName: null,
      } as never,
      booking: {
        id: BOOKING_REF,
        status: 'CONFIRMED',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-13T18:00:00.000Z'),
      },
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });

    expect(dto.invoice.id).toBe(INVOICE_BOOKING);
    expect(dto.invoice.invoiceNumber).toBe('FSM-2026-0042');
    expect(dto.invoice.direction).toBe('OUTGOING');
    expect(dto.invoice.issueDate).toBe('2026-07-10T10:05:00.000Z');
    expect(dto.amounts.totalGrossCents).toBe(53550);
    expect(dto.amounts.outstandingAmountCents).toBe(53550);
    expect(dto.customer?.displayName).toBe('Max Müller');
    expect(dto.booking?.reference).toBe(BOOKING_REF.slice(0, 8).toUpperCase());
    expect(dto.vehicle?.licensePlate).toBe('B-XY 123');
    expect(dto.provenance.kind).toBe('BOOKING_AUTOMATIC');
    expect(dto.provenance.label).not.toBe('Verknüpft');
    expect(dto.lineItems.length).toBeGreaterThan(0);
    expect(dto.lineItems[0].grossCents).toBe(53550);
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
    expect(dto.provenance.label).toContain('Schlussrechnung');
  });

  it('exposes capabilities with blocking reasons for draft without PDF', () => {
    const dto = mapInvoiceDetail({
      invoice: makeOrgInvoiceRow({
        status: OrgInvoiceStatus.DRAFT,
        sequenceNumber: null,
        sequenceYear: null,
        invoiceNumberDisplay: null,
      }) as never,
      customer: { id: CUSTOMER_MUELLER, firstName: 'A', lastName: 'B', email: null } as never,
      vehicle: null,
      booking: { id: BOOKING_REF, status: 'CONFIRMED', startDate: new Date(), endDate: new Date() },
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
    });
    expect(dto.capabilities.canIssue).toBe(true);
    expect(dto.capabilities.canSend).toBe(false);
    expect(dto.capabilities.blockingReasons.send).toContain('Rechnung muss zuerst ausgestellt werden');
  });
});
