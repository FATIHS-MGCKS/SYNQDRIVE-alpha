import { aggregateCostEvents, type E4CostEventInput } from './evaluations-cost.domain';

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const END = Date.UTC(2026, 1, 1, 0, 0, 0);
const MID = Date.UTC(2026, 0, 15, 0, 0, 0);

function event(overrides: Partial<E4CostEventInput>): E4CostEventInput {
  return {
    category: 'OPERATING_EXPENSES',
    nature: 'ACTUAL',
    amountMinor: 10000,
    currency: 'EUR',
    economicKey: 'invoice:1',
    businessAtMs: MID,
    ...overrides,
  };
}

describe('E4 cost model domain', () => {
  it('aggregates an observed cost from a single source', () => {
    const result = aggregateCostEvents([event({})], START, END);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].totalsByCurrency).toEqual([{ amountMinor: 10000, currency: 'EUR' }]);
    expect(result.totalsByCurrency).toEqual([{ amountMinor: 10000, currency: 'EUR' }]);
  });

  it('aggregates multiple categories independently', () => {
    const result = aggregateCostEvents(
      [
        event({ economicKey: 'invoice:1', category: 'OPERATING_EXPENSES', amountMinor: 5000 }),
        event({ economicKey: 'servicecase:9', category: 'UNPLANNED_MAINTENANCE', amountMinor: 3000 }),
        event({ economicKey: 'damage:4', category: 'DAMAGE_REPAIR', amountMinor: 2000 }),
      ],
      START,
      END,
    );
    expect(result.categories.map((c) => c.category)).toEqual([
      'OPERATING_EXPENSES',
      'UNPLANNED_MAINTENANCE',
      'DAMAGE_REPAIR',
    ]);
    expect(result.totalsByCurrency).toEqual([{ amountMinor: 10000, currency: 'EUR' }]);
  });

  it('counts a linked duplicate once, preferring the authoritative invoice fact', () => {
    // An incoming invoice and the damage it pays for share one economic key.
    const result = aggregateCostEvents(
      [
        event({ economicKey: 'extraction:77', category: 'DAMAGE_REPAIR', amountMinor: 2000 }),
        event({ economicKey: 'extraction:77', category: 'OPERATING_EXPENSES', amountMinor: 2000 }),
      ],
      START,
      END,
    );
    expect(result.deduplicatedCount).toBe(1);
    expect(result.totalsByCurrency).toEqual([{ amountMinor: 2000, currency: 'EUR' }]);
    // Invoice (operating expenses) wins the tie-break.
    expect(result.categories.map((c) => c.category)).toEqual(['OPERATING_EXPENSES']);
  });

  it('excludes records outside the period using the business timestamp (no future leak)', () => {
    const result = aggregateCostEvents(
      [
        event({ economicKey: 'invoice:1', businessAtMs: MID, amountMinor: 4000 }),
        event({ economicKey: 'invoice:2', businessAtMs: END + 5000, amountMinor: 9999 }),
        event({ economicKey: 'invoice:3', businessAtMs: START - 5000, amountMinor: 8888 }),
      ],
      START,
      END,
    );
    expect(result.droppedFutureOrPastCount).toBe(2);
    expect(result.totalsByCurrency).toEqual([{ amountMinor: 4000, currency: 'EUR' }]);
  });

  it('segments mixed EUR/USD without a false blended total', () => {
    const result = aggregateCostEvents(
      [
        event({ economicKey: 'invoice:1', currency: 'EUR', amountMinor: 5000 }),
        event({ economicKey: 'invoice:2', currency: 'USD', amountMinor: 7000 }),
      ],
      START,
      END,
    );
    expect(result.currencies).toEqual(['EUR', 'USD']);
    expect(result.totalsByCurrency).toEqual([
      { amountMinor: 5000, currency: 'EUR' },
      { amountMinor: 7000, currency: 'USD' },
    ]);
  });

  it('keeps an explicit zero observed cost as a real value', () => {
    const result = aggregateCostEvents(
      [event({ economicKey: 'invoice:1', amountMinor: 0 })],
      START,
      END,
    );
    expect(result.totalsByCurrency).toEqual([{ amountMinor: 0, currency: 'EUR' }]);
  });

  it('returns no categories when there are no source events (caller maps to UNAVAILABLE, not zero)', () => {
    const result = aggregateCostEvents([], START, END);
    expect(result.categories).toEqual([]);
    expect(result.totalsByCurrency).toEqual([]);
  });
});
