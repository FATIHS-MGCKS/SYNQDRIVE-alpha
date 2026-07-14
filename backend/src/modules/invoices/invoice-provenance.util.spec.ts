import {
  InvoiceCreationChannel,
  InvoiceSourceType,
  InvoiceTriggeredByType,
  OrgInvoiceType,
} from '@prisma/client';
import {
  BOOKING_REF,
  INVOICE_BOOKING,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';
import {
  formatProvenanceActorDisplay,
  hasRecordedInvoiceProvenance,
  inferLegacySourceFromLinks,
  mapInvoiceProvenance,
} from './invoice-provenance.util';

describe('invoice-provenance.util', () => {
  const baseLegacyRow = makeOrgInvoiceRow();

  describe('hasRecordedInvoiceProvenance', () => {
    it('is false when provenance columns are null (legacy row)', () => {
      expect(hasRecordedInvoiceProvenance(baseLegacyRow as never)).toBe(false);
    });

    it('is true when channel, source and trigger are set', () => {
      expect(
        hasRecordedInvoiceProvenance({
          ...baseLegacyRow,
          creationChannel: InvoiceCreationChannel.BOOKING_WIZARD,
          sourceType: InvoiceSourceType.BOOKING,
          triggeredByType: InvoiceTriggeredByType.SYSTEM,
        } as never),
      ).toBe(true);
    });
  });

  describe('inferLegacySourceFromLinks', () => {
    it('uses bookingId as factual BOOKING source without inventing channel', () => {
      expect(inferLegacySourceFromLinks({ bookingId: BOOKING_REF, documentExtractionId: null, vendorId: null })).toEqual({
        sourceType: 'BOOKING',
        sourceId: BOOKING_REF,
      });
    });

    it('uses documentExtractionId as DOCUMENT source', () => {
      expect(
        inferLegacySourceFromLinks({
          bookingId: null,
          documentExtractionId: 'ext-1',
          vendorId: null,
        }),
      ).toEqual({ sourceType: 'DOCUMENT', sourceId: 'ext-1' });
    });

    it('falls back to MANUAL when no link exists', () => {
      expect(
        inferLegacySourceFromLinks({ bookingId: null, documentExtractionId: null, vendorId: null }),
      ).toEqual({ sourceType: 'MANUAL', sourceId: null });
    });
  });

  describe('mapInvoiceProvenance — legacy classification', () => {
    it('classifies legacy OUTGOING_BOOKING without inventing channel or actor', () => {
      const dto = mapInvoiceProvenance(baseLegacyRow as never);
      expect(dto.classification).toBe('LEGACY');
      expect(dto.creationChannel).toBe('LEGACY');
      expect(dto.triggeredByType).toBe('UNKNOWN');
      expect(dto.sourceType).toBe('BOOKING');
      expect(dto.sourceId).toBe(BOOKING_REF);
      expect(dto.kind).toBe('BOOKING_AUTOMATIC');
      expect(dto.label).toContain('Buchung');
    });

    it('does not equate OUTGOING_FINAL type with manual provenance label only', () => {
      const dto = mapInvoiceProvenance(
        makeOrgInvoiceRow({ type: OrgInvoiceType.OUTGOING_FINAL }) as never,
      );
      expect(dto.classification).toBe('LEGACY');
      expect(dto.kind).toBe('BOOKING_FINAL');
      expect(dto.creationChannel).toBe('LEGACY');
      expect(dto.triggeredByType).toBe('UNKNOWN');
    });

    it('maps legacy incoming extraction from type without inventing actor', () => {
      const dto = mapInvoiceProvenance(
        makeOrgInvoiceRow({
          type: OrgInvoiceType.INCOMING_UPLOADED,
          bookingId: null,
          documentExtractionId: 'ext-99',
        }) as never,
      );
      expect(dto.sourceType).toBe('DOCUMENT');
      expect(dto.sourceId).toBe('ext-99');
      expect(dto.triggeredByType).toBe('UNKNOWN');
    });
  });

  describe('mapInvoiceProvenance — recorded', () => {
    it('maps stored provenance fields without type-based guessing', () => {
      const dto = mapInvoiceProvenance({
        ...baseLegacyRow,
        type: OrgInvoiceType.OUTGOING_MANUAL,
        creationChannel: InvoiceCreationChannel.MANUAL_UI,
        sourceType: InvoiceSourceType.MANUAL,
        sourceId: null,
        triggeredByType: InvoiceTriggeredByType.USER,
        createdByUserId: 'user-1',
        automationId: null,
        correlationId: 'req-abc',
      } as never);

      expect(dto.classification).toBe('RECORDED');
      expect(dto.creationChannel).toBe('MANUAL_UI');
      expect(dto.sourceType).toBe('MANUAL');
      expect(dto.triggeredByType).toBe('USER');
      expect(dto.correlationId).toBe('req-abc');
      expect(dto.createdAt).toBe(baseLegacyRow.createdAt.toISOString());
    });

    it('resolves actor display from user relation without storing PII on invoice', () => {
      const dto = mapInvoiceProvenance(
        {
          ...baseLegacyRow,
          creationChannel: InvoiceCreationChannel.API,
          sourceType: InvoiceSourceType.BOOKING,
          sourceId: BOOKING_REF,
          triggeredByType: InvoiceTriggeredByType.API_CLIENT,
          createdByUserId: 'user-api',
        } as never,
        {
          id: 'user-api',
          name: null,
          firstName: 'API',
          lastName: 'Operator',
          email: 'api@example.com',
        },
      );
      expect(dto.createdByUserDisplayName).toBe('API Operator');
    });

    it('maps automation channel with automationId', () => {
      const dto = mapInvoiceProvenance({
        ...baseLegacyRow,
        creationChannel: InvoiceCreationChannel.AUTOMATION,
        sourceType: InvoiceSourceType.BOOKING,
        sourceId: BOOKING_REF,
        triggeredByType: InvoiceTriggeredByType.AUTOMATION,
        automationId: 'wf-booking-invoice',
        correlationId: null,
        createdByUserId: null,
      } as never);
      expect(dto.automationId).toBe('wf-booking-invoice');
      expect(dto.triggeredByType).toBe('AUTOMATION');
    });
  });

  describe('formatProvenanceActorDisplay', () => {
    it('prefers first/last name over email', () => {
      expect(
        formatProvenanceActorDisplay({
          id: 'u1',
          name: 'Ignored',
          firstName: 'Max',
          lastName: 'Müller',
          email: 'max@example.com',
        }),
      ).toBe('Max Müller');
    });
  });
});
