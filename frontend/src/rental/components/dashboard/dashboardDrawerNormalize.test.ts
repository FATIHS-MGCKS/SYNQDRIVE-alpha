import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import { buildDashboardGroups } from './dashboardDrilldownGroups';
import {
  composeVehicleDrawerRowDisplay,
  readyToRentDrawerHint,
} from './dashboardDrilldownRowDisplay';
import {
  drawerHeaderHint,
  mergeDrawerGroupRows,
  normalizeDashboardDrawerGroups,
} from './dashboardDrawerNormalize';
import { semanticDedupeDisplayReasons } from './reasonDisplay';
import { buildDashboardRuntimeModel } from './runtime/dashboardSliceBuilder';
import type { DashboardSliceRow, RuntimeReason } from './runtime';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS MX 2024',
    make: overrides.make ?? 'BMW',
    model: overrides.model ?? 'X3',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? false,
    lastSignal: overrides.lastSignal,
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'OFFLINE',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

function health(overrides: Partial<VehicleHealthResponse> & { vehicleId: string }): VehicleHealthResponse {
  return {
    vehicle_id: overrides.vehicleId,
    overall_state: overrides.overall_state ?? 'critical',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules: overrides.modules ?? {},
    ...overrides,
  } as VehicleHealthResponse;
}

function insight(overrides: Partial<DashboardInsight> = {}): DashboardInsight {
  return {
    id: overrides.id ?? 'insight-1',
    type: overrides.type ?? 'SERVICE_OVERDUE',
    severity: overrides.severity ?? 'CRITICAL',
    priority: overrides.priority ?? 100,
    title: overrides.title ?? 'Service überfällig',
    message: overrides.message ?? 'Service overdue',
    actionLabel: overrides.actionLabel ?? null,
    actionType: overrides.actionType ?? null,
    entityScope: overrides.entityScope ?? 'vehicle',
    entityIds: overrides.entityIds ?? ['svc-1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: overrides.isGrouped ?? false,
    groupCount: overrides.groupCount ?? 1,
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    ...overrides,
  };
}

function reason(overrides: Partial<RuntimeReason> = {}): RuntimeReason {
  return {
    id: overrides.id ?? 'r1',
    category: overrides.category ?? 'service',
    severity: overrides.severity ?? 'critical',
    title: overrides.title ?? 'Service überfällig',
    source: overrides.source ?? 'rental-health:service_compliance',
    ...overrides,
  };
}

function sliceRow(overrides: Partial<DashboardSliceRow> = {}): DashboardSliceRow {
  return {
    id: overrides.id ?? 'vehicle:v1:test',
    vehicleId: overrides.vehicleId ?? 'v1',
    title: overrides.title ?? 'KS MX 2024',
    severity: overrides.severity ?? 'critical',
    primaryActionLabel: overrides.primaryActionLabel ?? 'Open vehicle',
    ...overrides,
  };
}

describe('semanticDedupeDisplayReasons', () => {
  it('keeps the specific service overdue text over the generic label', () => {
    const result = semanticDedupeDisplayReasons(
      [
        reason({ title: 'Service überfällig' }),
        reason({ id: 'r2', title: 'Service überfällig seit 117 Tagen (HM/OEM)' }),
      ],
      'de',
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toContain('117 Tagen');
  });

  it('keeps distinct real problems on the same row', () => {
    const result = semanticDedupeDisplayReasons(
      [
        reason({ category: 'service', title: 'Service überfällig seit 117 Tagen (HM/OEM)' }),
        reason({ id: 'b', category: 'battery', title: 'Batterie-Warnleuchte' }),
        reason({ id: 't', category: 'telemetry', title: 'Offline' }),
      ],
      'de',
    );
    expect(result).toHaveLength(3);
  });
});

describe('mergeDrawerGroupRows', () => {
  it('merges duplicate vehicle rows within one group and clears meta', () => {
    const merged = mergeDrawerGroupRows(
      [
        sliceRow({
          id: 'vehicle:v1:critical-service',
          meta: 'Service überfällig',
          reasons: [reason({ title: 'Service überfällig' })],
        }),
        sliceRow({
          id: 'vehicle:v1:critical-insight',
          reasons: [reason({ id: 'r2', title: 'Service überfällig seit 117 Tagen (HM/OEM)' })],
        }),
      ],
      'de',
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.meta).toBeUndefined();
    expect(merged[0]?.reasons).toHaveLength(1);
    expect(merged[0]?.reasons?.[0]?.title).toContain('117 Tagen');
  });
});

describe('critical alerts drawer normalization', () => {
  it('shows one compliance-critical card for KS MX 2024 with merged service overdue reasons', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-1',
        health({
          vehicleId: 'svc-1',
          modules: {
            service_compliance: {
              state: 'critical',
              reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
            },
          },
        }),
      ],
    ]);

    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'svc-1', license: 'KS MX 2024' })],
      healthMap,
      insights: [
        insight({
          id: 'svc-insight',
          type: 'SERVICE_OVERDUE',
          title: 'Service überfällig',
          entityIds: ['svc-1'],
        }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['critical-alerts'];
    const groups = buildDashboardGroups(slice, 'de');
    const compliance = groups.find((group) => group.id === 'compliance-critical');

    expect(slice.count).toBe(1);
    expect(compliance?.rows.filter((row) => row.vehicleId === 'svc-1')).toHaveLength(1);

    const state = runtime.vehicleStates.find((entry) => entry.vehicleId === 'svc-1');
    const display = composeVehicleDrawerRowDisplay(compliance?.rows[0]!, state, 'de');
    expect(display.title).toBe('KS MX 2024');
    expect(display.title.match(/KS MX 2024/g)?.length).toBe(1);
    expect(display.subtitle?.toLowerCase()).not.toContain('available');
    expect(display.locationLine?.match(/Zentrale/g)?.length).toBe(1);
    expect(display.primaryReason).toContain('117 Tagen');
    expect(display.primaryReason?.toLowerCase()).not.toBe('service überfällig');
  });
});

describe('ready-to-rent drawer normalization', () => {
  it('keeps not-ready vehicle unique and uses ready/not-ready subline', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const groups = buildDashboardGroups(slice, 'de');

    expect(slice.count).toBe(1);
    expect(readyToRentDrawerHint(slice, 'de')).toBe('1 bereit · 1 nicht bereit');
    expect(drawerHeaderHint(slice, 'de')).toBeUndefined();

    const notReady = groups.find((group) => group.id === 'available-but-not-ready');
    expect(notReady?.rows.filter((row) => row.vehicleId === 'dirty')).toHaveLength(1);
  });
});

describe('normalizeDashboardDrawerGroups', () => {
  it('deduplicates vehicleId within each group independently', () => {
    const groups = normalizeDashboardDrawerGroups(
      [
        {
          id: 'compliance-critical',
          title: 'Compliance',
          count: 2,
          rows: [
            sliceRow({ id: 'vehicle:a:1', vehicleId: 'a' }),
            sliceRow({ id: 'vehicle:a:2', vehicleId: 'a' }),
          ],
        },
      ],
      'de',
    );

    expect(groups[0]?.count).toBe(1);
    expect(groups[0]?.rows).toHaveLength(1);
  });
});
