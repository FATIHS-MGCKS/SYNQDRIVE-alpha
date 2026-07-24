import {
  enrichHealthCandidateWithBooking,
  gateHealthInsightsForBusinessContext,
  estimateBookingRevenueCents,
} from './insight-health-gate';
import {
  InsightCandidate,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from './insight.types';

function healthCandidate(overrides: Partial<InsightCandidate> = {}): InsightCandidate {
  return {
    type: InsightType.BATTERY_CRITICAL,
    severity: InsightSeverity.CRITICAL,
    priority: 80,
    title: 'Battery critical',
    message: 'Battery state of charge critically low.',
    actionLabel: 'View health',
    actionType: 'navigate_health',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['veh-1'],
    reasons: ['Battery SoC below threshold'],
    confidence: 1,
    dedupeKey: 'battery:veh-1',
    ...overrides,
  };
}

describe('insight-health-gate', () => {
  const now = new Date('2026-06-16T10:00:00.000Z');
  const booking = {
    id: 'book-1',
    vehicleId: 'veh-1',
    customerId: 'cust-1',
    startDate: new Date('2026-06-17T09:00:00.000Z'),
    totalPriceCents: 14_900,
    dailyRateCents: null,
  };

  it('drops raw health insights without upcoming booking', () => {
    const out = gateHealthInsightsForBusinessContext(
      [healthCandidate()],
      new Map(),
      new Map([['veh-1', 'ABC-123']]),
      now,
    );
    expect(out).toHaveLength(0);
  });

  it('enriches health insight when booking exists', () => {
    const out = gateHealthInsightsForBusinessContext(
      [healthCandidate()],
      new Map([['veh-1', booking]]),
      new Map([['veh-1', 'ABC-123']]),
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Ausfallrisiko vor Buchung');
    expect(out[0].metrics?.category).toBe('BUSINESS_RISK');
    expect(out[0].metrics?.bookingId).toBe('book-1');
    expect(out[0].metrics?.financialImpactAmountMinor).toBe(14_900);
    expect(out[0].metrics?.financialImpactCurrency).toBe('EUR');
  });

  it('passes non-health candidates through with category tag', () => {
    const handover: InsightCandidate = {
      ...healthCandidate(),
      type: InsightType.TIGHT_HANDOVER,
      dedupeKey: 'handover:1',
    };
    const out = gateHealthInsightsForBusinessContext(
      [handover],
      new Map(),
      new Map(),
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0].metrics?.category).toBe('BUSINESS_RISK');
  });

  it('estimateBookingRevenueCents prefers totalPriceCents', () => {
    expect(
      estimateBookingRevenueCents({
        ...booking,
        totalPriceCents: 5000,
        dailyRateCents: 1000,
      }),
    ).toBe(5000);
  });

  it('enrichHealthCandidateWithBooking includes revenue in message', () => {
    const enriched = enrichHealthCandidateWithBooking(
      healthCandidate(),
      booking,
      'ABC-123',
      now,
    );
    expect(enriched.message).toContain('149');
    expect(enriched.metrics?.recommendation).toMatch(/prüfen/);
  });
});
