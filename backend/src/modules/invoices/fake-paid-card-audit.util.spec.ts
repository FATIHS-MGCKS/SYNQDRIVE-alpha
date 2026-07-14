import {
  AUTO_BOOKING_PREPAY_NOTE,
  evaluateFakePaidCardPayment,
  hasExactAutoBookingPrepayNote,
  isBookingConfirmTimingCorrelated,
  looksLikeStripeReference,
} from './fake-paid-card-audit.util';
import type { FakePaidPaymentEvaluationInput } from './fake-paid-card-audit.types';

function baseInput(
  overrides: Partial<FakePaidPaymentEvaluationInput> = {},
): FakePaidPaymentEvaluationInput {
  const bookingUpdatedAt = new Date('2026-06-01T10:00:00.000Z');
  return {
    paymentId: 'pay-1',
    organizationId: 'org-1',
    invoiceId: 'inv-1',
    bookingId: 'bk-1',
    invoiceNumber: 'FSM-2026-0001',
    amountCents: 10_000,
    currency: 'EUR',
    paymentMethod: 'CARD',
    paymentReference: null,
    paymentNote: AUTO_BOOKING_PREPAY_NOTE,
    paymentCreatedAt: new Date('2026-06-01T10:00:30.000Z'),
    bookingUpdatedAt,
    hasManualPaymentActivityLog: false,
    ...overrides,
  };
}

describe('fake-paid-card-audit.util', () => {
  describe('looksLikeStripeReference', () => {
    it('detects Stripe payment intent and charge prefixes', () => {
      expect(looksLikeStripeReference('pi_abc123')).toBe(true);
      expect(looksLikeStripeReference('ch_abc123')).toBe(true);
      expect(looksLikeStripeReference('stripe:pi_abc')).toBe(true);
    });

    it('returns false for empty or non-Stripe references', () => {
      expect(looksLikeStripeReference(null)).toBe(false);
      expect(looksLikeStripeReference('TAN-12345')).toBe(false);
    });
  });

  describe('evaluateFakePaidCardPayment', () => {
    it('HIGH: CARD + auto note + booking timing + no manual audit', () => {
      const result = evaluateFakePaidCardPayment(baseInput());
      expect(result.isCandidate).toBe(true);
      expect(result.confidence).toBe('HIGH');
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          'Payment note matches auto-generated booking-checkout prepay text',
          'No manual invoice payment API activity log near payment time',
        ]),
      );
    });

    it('MEDIUM: CARD + timing correlation but custom note', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({ paymentNote: 'Kartenzahlung vor Ort' }),
      );
      expect(result.isCandidate).toBe(true);
      expect(result.confidence).toBe('MEDIUM');
    });

    it('LOW: CARD without timing correlation', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({
          paymentCreatedAt: new Date('2026-06-02T12:00:00.000Z'),
          paymentNote: 'Manuelle Kartenzahlung',
        }),
      );
      expect(result.isCandidate).toBe(true);
      expect(result.confidence).toBe('LOW');
    });

    it('not a candidate: CARD with Stripe reference (legitimate Stripe-backed payment)', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({ paymentReference: 'pi_3NxStripeExample' }),
      );
      expect(result.isCandidate).toBe(false);
      expect(result.confidence).toBeNull();
    });

    it('not a candidate: bank transfer payment', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({ paymentMethod: 'BANK_TRANSFER', paymentNote: 'Überweisung' }),
      );
      expect(result.isCandidate).toBe(false);
    });

    it('not a candidate: cash payment', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({ paymentMethod: 'CASH', paymentNote: 'Bar erhalten' }),
      );
      expect(result.isCandidate).toBe(false);
    });

    it('LOW when manual payment activity log exists (staff API path)', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({
          hasManualPaymentActivityLog: true,
          paymentNote: 'Terminal-Zahlung Schalter',
        }),
      );
      expect(result.isCandidate).toBe(true);
      expect(result.confidence).toBe('LOW');
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          'Manual invoice payment API activity log found near payment time — may be legitimate staff action',
        ]),
      );
    });

    it('STRIPE method without reference is a candidate', () => {
      const result = evaluateFakePaidCardPayment(
        baseInput({ paymentMethod: 'STRIPE', paymentReference: null }),
      );
      expect(result.isCandidate).toBe(true);
      expect(result.confidence).toBe('HIGH');
    });
  });

  describe('helpers', () => {
    it('matches exact auto booking prepay note', () => {
      expect(hasExactAutoBookingPrepayNote(AUTO_BOOKING_PREPAY_NOTE)).toBe(true);
      expect(hasExactAutoBookingPrepayNote('other')).toBe(false);
    });

    it('detects booking confirmation timing window', () => {
      const bookingAt = new Date('2026-06-01T10:00:00.000Z');
      expect(
        isBookingConfirmTimingCorrelated(new Date('2026-06-01T10:04:59.000Z'), bookingAt),
      ).toBe(true);
      expect(
        isBookingConfirmTimingCorrelated(new Date('2026-06-01T10:06:00.000Z'), bookingAt),
      ).toBe(false);
    });
  });
});
