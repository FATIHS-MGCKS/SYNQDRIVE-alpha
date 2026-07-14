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

  it('maps OUTGOING_FINAL provenance as legacy booking-final (type ≠ channel)', () => {
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
    expect(dto.provenance.classification).toBe('LEGACY');
    expect(dto.provenance.kind).toBe('BOOKING_FINAL');
    expect(dto.provenance.creationChannel).toBe('LEGACY');
    expect(dto.provenance.triggeredByType).toBe('UNKNOWN');
  });

  it('maps recorded provenance when columns are populated', () => {
    const dto = mapInvoiceDetail({
      invoice: makeOrgInvoiceRow({
        creationChannel: 'MANUAL_UI',
        sourceType: 'MANUAL',
        sourceId: null,
        triggeredByType: 'USER',
        createdByUserId: 'user-1',
        correlationId: 'corr-1',
      }) as never,
      customer: null,
      vehicle: null,
      booking: null,
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
      createdByActor: {
        id: 'user-1',
        name: null,
        firstName: 'Anna',
        lastName: 'Admin',
        email: 'anna@org.de',
      },
    });
    expect(dto.provenance.classification).toBe('RECORDED');
    expect(dto.provenance.creationChannel).toBe('MANUAL_UI');
    expect(dto.provenance.createdByUserDisplayName).toBe('Anna Admin');
  });

  it('strips createdByUserId when actor is not org member', () => {
    const dto = mapInvoiceDetail({
      invoice: makeOrgInvoiceRow({
        creationChannel: 'MANUAL_UI',
        sourceType: 'MANUAL',
        triggeredByType: 'USER',
        createdByUserId: 'foreign-user',
      }) as never,
      customer: null,
      vehicle: null,
      booking: null,
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [],
      timeline: [],
      createdByActor: null,
    });
    expect(dto.provenance.createdByUserId).toBeNull();
    expect(dto.provenance.createdByUserDisplayName).toBeNull();
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

  it('maps emailSendHistory from outbound audit rows', () => {
    const dto = mapInvoiceDetail({
      invoice: baseRow as never,
      customer: null,
      vehicle: null,
      booking: null,
      documentsView: { activeDocumentId: null, cacheMismatch: false, documents: [] },
      outboundEmails: [
        {
          id: 'mail-1',
          invoiceId: INVOICE_BOOKING,
          sourceType: 'INVOICE_SINGLE',
          status: 'FAILED',
          deliveryStatus: 'FAILED',
          toEmail: 'fail@example.com',
          ccEmails: [],
          bccEmails: [],
          subject: 'Rechnung',
          fromEmail: 'noreply@test.de',
          fromName: null,
          replyToEmail: null,
          provider: 'resend',
          providerMessageId: null,
          errorCode: 'PROVIDER_ERROR',
          errorMessage: 'Mailbox unavailable',
          generatedDocumentId: 'doc-1',
          documentVersionNumber: 1,
          sentByUserId: null,
          idempotencyKey: null,
          correlationId: null,
          requestedAt: new Date('2026-07-11T09:00:00.000Z'),
          acceptedAt: null,
          sentAt: null,
          deliveredAt: null,
          failedAt: new Date('2026-07-11T09:05:00.000Z'),
          createdAt: new Date('2026-07-11T09:00:00.000Z'),
          attachments: [{ generatedDocumentId: 'doc-1' }],
        } as never,
      ],
      timeline: [],
    });
    expect(dto.emailSendHistory).toHaveLength(1);
    expect(dto.emailSendHistory[0]).toMatchObject({
      recipient: 'fail@example.com',
      channel: 'E-Mail (Rechnung)',
      documentVersion: 1,
      retryPossible: true,
      errorMessage: 'Mailbox unavailable',
    });
  });
});
