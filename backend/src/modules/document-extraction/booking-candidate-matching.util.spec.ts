import {
  BOOKING_CANDIDATE_CONFLICT_CODES,
  BOOKING_CANDIDATE_MATCH_REASONS,
} from './booking-candidate-resolver.types';
import {
  buildBookingResolverHints,
  scoreBookingCandidates,
} from './booking-candidate-matching.util';

describe('booking-candidate-matching.util', () => {
  const vehicleId = 'veh-1';
  const bookingA = {
    id: '11111111-1111-4111-8111-111111111111',
    vehicleId,
    customerId: 'cust-1',
    assignedDriverId: null,
    startDate: new Date('2026-07-10T08:00:00.000Z'),
    endDate: new Date('2026-07-12T18:00:00.000Z'),
    status: 'ACTIVE',
    customer: { firstName: 'Max', lastName: 'Muster', company: null },
  };
  const bookingB = {
    id: '22222222-2222-4222-8222-222222222222',
    vehicleId,
    customerId: 'cust-2',
    assignedDriverId: null,
    startDate: new Date('2026-07-11T09:00:00.000Z'),
    endDate: new Date('2026-07-13T18:00:00.000Z'),
    status: 'COMPLETED',
    customer: { firstName: 'Erika', lastName: 'Beispiel', company: null },
  };

  it('returns zero candidates when no bookings are loaded', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });
    expect(scoreBookingCandidates({ bookings: [], hints })).toHaveLength(0);
  });

  it('returns one unambiguous candidate for unique offense date overlap', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });
    const candidates = scoreBookingCandidates({ bookings: [bookingA], hints });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].bookingId).toBe(bookingA.id);
    expect(candidates[0].temporalOverlap).toBe(true);
    expect(candidates[0].matchReasons).toContain(BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP);
    expect(candidates[0].confirmationRequired).toBe(true);
  });

  it('keeps multiple overlapping bookings ambiguous with confirmation required', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'FINE',
      extractedData: { eventDate: '2026-07-11' },
    });
    const candidates = scoreBookingCandidates({ bookings: [bookingA, bookingB], hints });
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.every((c) => c.temporalOverlap)).toBe(true);
    expect(candidates.every((c) => c.confirmationRequired)).toBe(true);
    expect(
      candidates.some((c) =>
        c.conflicts.some((conflict) => conflict.code === BOOKING_CANDIDATE_CONFLICT_CODES.OVERLAPPING_BOOKINGS),
      ),
    ).toBe(true);
  });

  it('returns no candidates when event time is missing and no strong reference exists', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'INVOICE',
      extractedData: { customerName: 'Max Muster' },
    });
    const candidates = scoreBookingCandidates({ bookings: [bookingA], hints });
    expect(candidates).toHaveLength(0);
  });

  it('does not auto-match on customer name alone', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'INVOICE',
      extractedData: {
        invoiceDate: '2026-07-11',
        customerName: 'Max Muster',
      },
    });
    const candidates = scoreBookingCandidates({ bookings: [bookingA, bookingB], hints });
    expect(candidates.some((c) => c.matchReasons.includes(BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME))).toBe(
      true,
    );
    expect(
      candidates.some(
        (c) =>
          c.matchReasons.length === 1 &&
          c.matchReasons[0] === BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME,
      ),
    ).toBe(false);
  });

  it('boosts exact booking reference matches', () => {
    const hints = buildBookingResolverHints({
      organizationId: 'org-1',
      vehicleId,
      documentType: 'FINE',
      extractedData: {
        bookingReference: bookingA.id,
        eventDate: '2026-07-11',
      },
    });
    const candidates = scoreBookingCandidates({ bookings: [bookingA, bookingB], hints });
    expect(candidates[0].bookingId).toBe(bookingA.id);
    expect(candidates[0].matchReasons).toContain(
      BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT,
    );
  });
});
