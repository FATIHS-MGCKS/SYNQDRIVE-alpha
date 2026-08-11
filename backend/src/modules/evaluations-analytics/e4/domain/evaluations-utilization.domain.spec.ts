import { computeUtilization, type E4VehicleUtilizationInput } from './evaluations-utilization.domain';

const H = 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const END = Date.UTC(2026, 0, 11, 0, 0, 0); // 10-day period
const PERIOD_MS = END - START;

function vehicle(overrides: Partial<E4VehicleUtilizationInput>): E4VehicleUtilizationInput {
  return { rented: [], maintenance: [], blocked: [], ...overrides };
}

describe('E4 utilization domain', () => {
  it('reports 100% for a fully-rented vehicle', () => {
    const result = computeUtilization(
      [vehicle({ rented: [{ startMs: START, endExclusiveMs: END }] })],
      START,
      END,
    );
    expect(result.utilizationRatio).toBe(1);
    expect(result.capacityMs).toBe(PERIOD_MS);
    expect(result.rentedMs).toBe(PERIOD_MS);
  });

  it('reports a fractional ratio for a partially-rented vehicle', () => {
    const result = computeUtilization(
      [vehicle({ rented: [{ startMs: START, endExclusiveMs: START + PERIOD_MS / 2 }] })],
      START,
      END,
    );
    expect(result.utilizationRatio).toBe(0.5);
  });

  it('reports 0% (a real measured zero) for an eligible vehicle with no rental', () => {
    const result = computeUtilization([vehicle({})], START, END);
    expect(result.utilizationRatio).toBe(0);
    expect(result.eligibleVehicles).toBe(1);
  });

  it('never exceeds 100% with overlapping rentals and flags the overlap', () => {
    const result = computeUtilization(
      [
        vehicle({
          rented: [
            { startMs: START, endExclusiveMs: END },
            { startMs: START + H, endExclusiveMs: START + 5 * H },
          ],
        }),
      ],
      START,
      END,
    );
    expect(result.utilizationRatio).toBe(1);
    expect(result.overlappingBookingPairs).toBe(1);
  });

  it('clips rentals that begin before / end after the period', () => {
    const result = computeUtilization(
      [vehicle({ rented: [{ startMs: START - 5 * H, endExclusiveMs: START + 5 * H }] })],
      START,
      END,
    );
    expect(result.rentedMs).toBe(5 * H);
  });

  it('reduces net capacity by maintenance downtime', () => {
    const result = computeUtilization(
      [
        vehicle({
          rented: [{ startMs: START, endExclusiveMs: START + 5 * H }],
          maintenance: [{ startMs: START + 5 * H, endExclusiveMs: END }],
        }),
      ],
      START,
      END,
    );
    expect(result.maintenanceMs).toBe(PERIOD_MS - 5 * H);
    expect(result.netCapacityMs).toBe(5 * H);
    expect(result.utilizationRatio).toBe(1);
  });

  it('excludes blocked downtime from net capacity', () => {
    const result = computeUtilization(
      [vehicle({ blocked: [{ startMs: START, endExclusiveMs: START + 2 * H }] })],
      START,
      END,
    );
    expect(result.blockedMs).toBe(2 * H);
    expect(result.netCapacityMs).toBe(PERIOD_MS - 2 * H);
  });

  it('returns null ratio when there is no net capacity (denominator zero)', () => {
    const result = computeUtilization(
      [vehicle({ maintenance: [{ startMs: START, endExclusiveMs: END }] })],
      START,
      END,
    );
    expect(result.netCapacityMs).toBe(0);
    expect(result.utilizationRatio).toBeNull();
  });

  it('ignores vehicles not eligible within the period', () => {
    const result = computeUtilization(
      [vehicle({ eligibility: { startMs: END + H, endExclusiveMs: END + 2 * H } })],
      START,
      END,
    );
    expect(result.eligibleVehicles).toBe(0);
    expect(result.utilizationRatio).toBeNull();
  });

  it('remains <=100% across a fleet with mixed occupancy', () => {
    const result = computeUtilization(
      [
        vehicle({ rented: [{ startMs: START, endExclusiveMs: END }] }),
        vehicle({ rented: [{ startMs: START, endExclusiveMs: START + PERIOD_MS / 4 }] }),
        vehicle({}),
      ],
      START,
      END,
    );
    expect(result.utilizationRatio).not.toBeNull();
    expect(result.utilizationRatio as number).toBeLessThanOrEqual(1);
    expect(result.utilizationRatio as number).toBeGreaterThan(0);
  });
});
