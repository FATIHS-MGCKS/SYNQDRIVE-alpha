import {
  isRentalHealthDataPartial,
  projectFleetHealthRow,
  stripFleetReadModelMeta,
} from './rental-health-summary.projection';
import type { VehicleHealth } from './rental-health.types';
import { RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS } from './rental-health-summary.types';

function sampleHealth(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      tires: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      brakes: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      error_codes: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      service_compliance: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      complaints: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      vehicle_alerts: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
    },
    generated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('rental-health-summary.projection', () => {
  const now = Date.parse('2026-07-01T12:00:00.000Z');

  it('marks cache_stale when cached entry exceeds soft stale threshold', () => {
    const cachedAt = new Date(
      now - RENTAL_HEALTH_SUMMARY_SOFT_STALE_MS - 1_000,
    ).toISOString();

    const row = projectFleetHealthRow(sampleHealth(), {
      cachedAt,
      fromCache: true,
      now,
    });

    expect(row.cache_stale).toBe(true);
    expect(row.data_partial).toBe(false);
  });

  it('does not mark fresh cache hits as cache_stale', () => {
    const cachedAt = new Date(now - 5_000).toISOString();
    const row = projectFleetHealthRow(sampleHealth(), {
      cachedAt,
      fromCache: true,
      now,
    });
    expect(row.cache_stale).toBe(false);
  });

  it('flags data_partial for degraded unknown modules', () => {
    const health = sampleHealth({
      modules: {
        ...sampleHealth().modules,
        battery: {
          state: 'unknown',
          reason: 'Daten nicht verfügbar',
          last_updated_at: null,
          data_stale: true,
        },
      },
    });
    expect(isRentalHealthDataPartial(health)).toBe(true);
  });

  it('stripFleetReadModelMeta preserves canonical detail fields', () => {
    const detail = sampleHealth({ overall_state: 'warning' });
    const summary = projectFleetHealthRow(detail, {
      cachedAt: '2026-07-01T00:00:00.000Z',
      fromCache: true,
      now,
    });

    expect(stripFleetReadModelMeta(summary)).toEqual(detail);
  });
});
