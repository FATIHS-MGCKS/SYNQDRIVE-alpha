import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import {
  buildFleetHealthServiceFreshness,
  buildFleetHealthServiceFreshnessDetailRows,
  computeOldestRelevantHealthSourceAt,
  countFleetHealthAvailability,
  countFleetStaleModules,
  formatFleetHealthServiceCompactLabel,
  formatRelativeTimeAt,
  parseTimestampMs,
} from './fleet-health-service-freshness';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

type ModuleKey = keyof VehicleHealthResponse['modules'];

function mod(
  state: RentalHealthState,
  lastUpdatedAt: string | null,
  extra: Partial<RentalHealthModule> = {},
): RentalHealthModule {
  return {
    state,
    reason: 'test',
    last_updated_at: lastUpdatedAt,
    data_stale: extra.data_stale ?? false,
    ...extra,
  };
}

function buildHealth(
  vehicleId: string,
  overrides: Partial<{
    availability: VehicleHealthResponse['availability'];
    generated_at: string;
    modules: Partial<Record<ModuleKey, RentalHealthModule>>;
  }> = {},
): VehicleHealthResponse {
  return {
    vehicle_id: vehicleId,
    organization_id: 'org1',
    overall_state: 'good',
    availability: overrides.availability ?? 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: mod('good', '2026-07-20T11:00:00.000Z'),
      tires: mod('good', '2026-07-20T11:00:00.000Z'),
      brakes: mod('good', '2026-07-20T11:00:00.000Z'),
      error_codes: mod('good', '2026-07-20T11:00:00.000Z'),
      service_compliance: mod('good', '2026-07-20T11:00:00.000Z'),
      complaints: mod('good', '2026-07-20T11:00:00.000Z'),
      vehicle_alerts: mod('good', '2026-07-20T11:00:00.000Z'),
      ...(overrides.modules ?? {}),
    },
    generated_at: overrides.generated_at ?? '2026-07-20T11:30:00.000Z',
  };
}

describe('fleet-health-service-freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parseTimestampMs handles invalid and timezone-bearing timestamps', () => {
    expect(parseTimestampMs('2026-07-20T12:00:00+02:00')).toBe(
      Date.parse('2026-07-20T12:00:00+02:00'),
    );
    expect(parseTimestampMs('not-a-date')).toBeNull();
    expect(parseTimestampMs('')).toBeNull();
    expect(parseTimestampMs(null)).toBeNull();
  });

  it('uses oldest relevant measurement across fleet, not newest vehicle', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'fresh',
        buildHealth('fresh', {
          modules: { battery: mod('good', '2026-07-20T11:55:00.000Z') },
        }),
      ],
      [
        'stale',
        buildHealth('stale', {
          modules: { battery: mod('good', '2026-07-19T08:00:00.000Z') },
        }),
      ],
    ]);

    expect(computeOldestRelevantHealthSourceAt(healthMap, ['fresh', 'stale'])).toBe(
      '2026-07-19T08:00:00.000Z',
    );
  });

  it('buildFleetHealthServiceFreshness separates fetch times from measurement times', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'v1',
        buildHealth('v1', {
          availability: 'partial',
          modules: {
            battery: mod('warning', '2026-07-18T10:00:00.000Z', { data_stale: true }),
          },
        }),
      ],
      ['v2', buildHealth('v2', { availability: 'unavailable' })],
    ]);

    const freshness = buildFleetHealthServiceFreshness({
      healthFetchedAt: '2026-07-20T11:58:00.000Z',
      healthMap,
      vehicleIds: ['v1', 'v2'],
      tasksFetchedAt: '2026-07-20T11:50:00.000Z',
      vendorsFetchedAt: '2026-07-20T11:45:00.000Z',
      serviceCasesFetchedAt: '2026-07-20T11:40:00.000Z',
    });

    expect(freshness.healthFetchedAt).toBe('2026-07-20T11:58:00.000Z');
    expect(freshness.oldestRelevantHealthSourceAt).toBe('2026-07-18T10:00:00.000Z');
    expect(freshness.tasksFetchedAt).toBe('2026-07-20T11:50:00.000Z');
    expect(freshness.vendorsFetchedAt).toBe('2026-07-20T11:45:00.000Z');
    expect(freshness.serviceCasesFetchedAt).toBe('2026-07-20T11:40:00.000Z');
    expect(freshness.partialHealthVehicleCount).toBe(1);
    expect(freshness.unavailableHealthVehicleCount).toBe(1);
    expect(freshness.staleModuleCount).toBe(1);
  });

  it('formatFleetHealthServiceCompactLabel uses oldest fetch and oldest measurement', () => {
    const freshness = buildFleetHealthServiceFreshness({
      healthFetchedAt: '2026-07-20T11:58:00.000Z',
      healthMap: new Map([
        [
          'v1',
          buildHealth('v1', {
            modules: { battery: mod('good', '2026-07-18T10:00:00.000Z') },
          }),
        ],
      ]),
      vehicleIds: ['v1'],
      tasksFetchedAt: '2026-07-20T11:50:00.000Z',
      vendorsFetchedAt: null,
      serviceCasesFetchedAt: null,
    });

    const label = formatFleetHealthServiceCompactLabel(freshness, 'de', NOW);
    expect(label).toContain('Geladen vor 10 Min.');
    expect(label).toContain('Älteste Messung vor 2 T.');
  });

  it('formatRelativeTimeAt returns unknown for invalid timestamps', () => {
    expect(formatRelativeTimeAt('invalid', NOW, 'de')).toBe('unbekannt');
    expect(formatRelativeTimeAt(null, NOW, 'en')).toBe('unknown');
  });

  it('buildFleetHealthServiceFreshnessDetailRows exposes each source separately', () => {
    const freshness = buildFleetHealthServiceFreshness({
      healthFetchedAt: '2026-07-20T11:58:00.000Z',
      healthMap: new Map([['v1', buildHealth('v1')]]),
      vehicleIds: ['v1'],
      tasksFetchedAt: '2026-07-20T11:50:00.000Z',
      vendorsFetchedAt: '2026-07-20T11:45:00.000Z',
      serviceCasesFetchedAt: '2026-07-20T11:40:00.000Z',
    });

    const rows = buildFleetHealthServiceFreshnessDetailRows(freshness, 'de', NOW);
    expect(rows.find((row) => row.key === 'healthFetchedAt')?.value).toBe('vor 2 Min.');
    expect(rows.find((row) => row.key === 'tasksFetchedAt')?.value).toBe('vor 10 Min.');
    expect(rows.find((row) => row.key === 'vendorsFetchedAt')?.value).toBe('vor 15 Min.');
    expect(rows.find((row) => row.key === 'serviceCasesFetchedAt')?.value).toBe('vor 20 Min.');
  });

  it('countFleetHealthAvailability and countFleetStaleModules aggregate fleet counts', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'v1',
        buildHealth('v1', {
          availability: 'partial',
          modules: { battery: mod('warning', '2026-07-20T10:00:00.000Z', { data_stale: true }) },
        }),
      ],
      [
        'v2',
        buildHealth('v2', {
          availability: 'unavailable',
          modules: { tires: mod('warning', '2026-07-20T10:00:00.000Z', { data_stale: true }) },
        }),
      ],
    ]);

    expect(countFleetHealthAvailability(healthMap, ['v1', 'v2'])).toEqual({
      partialHealthVehicleCount: 1,
      unavailableHealthVehicleCount: 1,
    });
    expect(countFleetStaleModules(healthMap, ['v1', 'v2'])).toBe(2);
  });
});
