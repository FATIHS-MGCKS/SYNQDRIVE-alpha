import { OrgInvoiceType } from '@prisma/client';
import { BOOKING_REF } from './__fixtures__/invoice-baseline.fixtures';
import { bookingNumberFromId } from './invoice-detail-relations.util';
import {
  buildBookingInvoiceTitle,
  buildFinalInvoiceTitle,
  buildUnpaidIncomingTaskTitle,
  buildUnpaidOutgoingTaskTitle,
  buildUnpaidTaskDescription,
  hasPublicInvoiceNumber,
  resolveInvoicePublicReference,
  titleContainsUuidFragment,
} from './invoice-display-reference.util';

const BOOKING_NUMBER = bookingNumberFromId(BOOKING_REF);

describe('invoice-display-reference.util', () => {
  describe('titleContainsUuidFragment', () => {
    it('detects legacy UUID fragment titles', () => {
      expect(titleContainsUuidFragment('Buchungsrechnung #d8e9f0a1')).toBe(true);
      expect(titleContainsUuidFragment(`Buchungsrechnung · ${BOOKING_NUMBER}`)).toBe(false);
    });
  });

  describe('resolveInvoicePublicReference', () => {
    it('uses invoice number when issued', () => {
      expect(
        resolveInvoicePublicReference({
          invoiceNumberDisplay: 'FSM-2026-0042',
          sequenceYear: 2026,
          sequenceNumber: 42,
          status: 'ISSUED',
          bookingId: BOOKING_REF,
        }),
      ).toBe('FSM-2026-0042');
    });

    it('uses booking number for draft booking invoice', () => {
      expect(
        resolveInvoicePublicReference({
          status: 'DRAFT',
          bookingId: BOOKING_REF,
          type: OrgInvoiceType.OUTGOING_BOOKING,
        }),
      ).toBe(BOOKING_NUMBER);
    });

    it('falls back to neutral manual label without booking', () => {
      expect(
        resolveInvoicePublicReference({
          status: 'DRAFT',
          type: OrgInvoiceType.OUTGOING_MANUAL,
          title: 'Werkstattkosten Januar',
        }),
      ).toBe('Werkstattkosten Januar');
    });
  });

  describe('buildBookingInvoiceTitle', () => {
    it('draft uses booking number', () => {
      expect(buildBookingInvoiceTitle({ bookingId: BOOKING_REF, status: 'DRAFT' })).toBe(
        `Buchungsrechnung · ${BOOKING_NUMBER}`,
      );
    });

    it('issued uses invoice number', () => {
      expect(
        buildBookingInvoiceTitle({
          bookingId: BOOKING_REF,
          invoiceNumberDisplay: 'FSM-2026-0042',
          sequenceYear: 2026,
          sequenceNumber: 42,
          status: 'ISSUED',
        }),
      ).toBe('Buchungsrechnung · FSM-2026-0042');
    });
  });

  describe('buildFinalInvoiceTitle', () => {
    it('draft uses booking number', () => {
      expect(buildFinalInvoiceTitle({ bookingId: BOOKING_REF, status: 'DRAFT' })).toBe(
        `Schlussrechnung · ${BOOKING_NUMBER}`,
      );
    });
  });

  describe('task titles', () => {
    it('outgoing draft task references booking', () => {
      expect(
        buildUnpaidOutgoingTaskTitle({
          status: 'DRAFT',
          bookingId: BOOKING_REF,
          type: OrgInvoiceType.OUTGOING_BOOKING,
        }),
      ).toBe(`Zahlungseingang prüfen · Buchung ${BOOKING_NUMBER}`);
    });

    it('outgoing issued task references invoice number', () => {
      expect(
        buildUnpaidOutgoingTaskTitle({
          invoiceNumberDisplay: 'FSM-2026-0042',
          sequenceYear: 2026,
          sequenceNumber: 42,
          status: 'ISSUED',
          bookingId: BOOKING_REF,
        }),
      ).toBe('Zahlungseingang prüfen · Rechnung FSM-2026-0042');
    });

    it('incoming task uses vendor name when no number', () => {
      expect(
        buildUnpaidIncomingTaskTitle({
          status: 'NEEDS_REVIEW',
          vendorName: 'Werkstatt Müller',
          type: OrgInvoiceType.INCOMING_VENDOR,
        }),
      ).toBe('Eingangsrechnung bezahlen · Werkstatt Müller');
    });

    it('task description never embeds UUID fragments', () => {
      const description = buildUnpaidTaskDescription(
        { status: 'DRAFT', bookingId: BOOKING_REF, type: OrgInvoiceType.OUTGOING_BOOKING },
        53550,
        'EUR',
      );
      expect(description).toContain(BOOKING_NUMBER);
      expect(description).not.toMatch(/#[0-9a-f]{8}/i);
    });
  });

  describe('hasPublicInvoiceNumber', () => {
    it('is false for draft without sequence', () => {
      expect(hasPublicInvoiceNumber({ status: 'DRAFT' })).toBe(false);
    });

    it('is true when display number exists', () => {
      expect(
        hasPublicInvoiceNumber({
          invoiceNumberDisplay: 'FSM-2026-0001',
          status: 'ISSUED',
        }),
      ).toBe(true);
    });
  });
});
