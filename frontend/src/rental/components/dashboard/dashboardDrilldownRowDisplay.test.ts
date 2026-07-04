import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import { buildDashboardGroups } from './dashboardDrilldownGroups';
import {
  buildReadyToRentDrawerGroups,
  composeVehicleDrawerRowDisplay,
  filterReadyToRentDrawerGroups,
  readyToRentDrawerHint,
} from './dashboardDrilldownRowDisplay';
import { buildDashboardRuntimeModel } from './runtime/dashboardSliceBuilder';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS MS 661',
    make: overrides.make ?? 'Audi',
    model: overrides.model ?? 'A4',
    year: overrides.year ?? 2022,
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

function insight(overrides: Partial<DashboardInsight> = {}): DashboardInsight {
  return {
    id: overrides.id ?? 'insight-1',
    type: overrides.type ?? 'BATTERY_CRITICAL',
    severity: overrides.severity ?? 'CRITICAL',
    priority: overrides.priority ?? 100,
    title: overrides.title ?? 'Battery critical',
    message: overrides.message ?? 'Battery needs action',
    actionLabel: overrides.actionLabel ?? null,
    actionType: overrides.actionType ?? null,
    entityScope: overrides.entityScope ?? 'vehicle',
    entityIds: overrides.entityIds ?? ['v1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: overrides.isGrouped ?? false,
    groupCount: overrides.groupCount ?? 1,
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    ...overrides,
  };
}

describe('ready-to-rent drawer row display', () => {
  it('shows not-ready vehicle only once with Ready/Not Ready sections', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const groups = buildReadyToRentDrawerGroups(slice, 'en');

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.id)).toEqual(['ready-now', 'available-but-not-ready']);
    expect(groups[1]?.count).toBe(1);
    expect(groups[1]?.rows).toHaveLength(1);
    const normalized = buildDashboardGroups(slice, 'en');
    expect(normalized.map((group) => group.id)).toEqual(groups.map((group) => group.id));
    expect(normalized[1]?.rows).toHaveLength(1);
  });

  it('uses ready/not-ready hint instead of available wording', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    expect(readyToRentDrawerHint(slice, 'de')).toBe('1 bereit · 1 nicht bereit');
    expect(slice.hint).toContain('verfügbar');
  });

  it('deduplicates license, station, operational status and duplicate reasons', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({
          id: 'critical-ready',
          license: 'KS MS 661',
          make: 'Audi',
          model: 'A4',
          cleaningStatus: 'Needs Cleaning',
        }),
      ],
      healthRiskVehicleIds: new Set(['critical-ready']),
      now: NOW,
    });

    const state = runtime.vehicleStates.find((entry) => entry.vehicleId === 'critical-ready');
    const row = runtime.slices['ready-to-rent'].secondaryRows?.[0];
    expect(state).toBeDefined();
    expect(row).toBeDefined();

    const display = composeVehicleDrawerRowDisplay(row!, state, 'en', { showReadiness: true });

    expect(display.title).toBe('KS MS 661');
    expect(display.subtitle?.toLowerCase()).not.toContain('ks ms 661');
    expect(display.subtitle?.toLowerCase()).not.toContain('available');
    expect(display.locationLine).toContain('Zentrale');
    expect(display.locationLine?.match(/Zentrale/g)?.length).toBe(1);
    expect(display.readinessLabel).toBe('Not Ready');
    if (display.primaryReason && row?.meta) {
      expect(display.primaryReason.toLowerCase()).not.toBe(row.meta.toLowerCase());
    }
  });

  it('allows Critical health with Ready readiness when vehicle is ready without blocker', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'critical-ready', license: 'HEALTH' })],
      insights: [
        insight({
          id: 'critical-insight',
          type: 'BATTERY_CRITICAL',
          severity: 'CRITICAL',
          entityIds: ['critical-ready'],
        }),
      ],
      now: NOW,
    });

    const readyState = runtime.vehicleStates.find((entry) => entry.vehicleId === 'critical-ready');
    const readyRow = runtime.slices['ready-to-rent'].rows.find((row) => row.vehicleId === 'critical-ready');
    expect(readyState?.isReadyToRent).toBe(true);
    expect(readyState?.isCritical).toBe(true);
    expect(readyState?.isBlocked).toBe(false);
    expect(readyRow).toBeDefined();

    const display = composeVehicleDrawerRowDisplay(readyRow!, readyState, 'en', { showReadiness: true });
    expect(display.readinessLabel).toBe('Ready');
    expect(display.healthLabel).toBe('Critical');
    expect(runtime.slices['ready-to-rent'].count).toBe(1);
    expect(buildReadyToRentDrawerGroups(runtime.slices['ready-to-rent'], 'en')[0]?.count).toBe(1);
  });
});

describe('ready-to-rent drawer search filter', () => {
  it('filters drawer groups by plate, make/model line, and station', () => {
    const groups = [
      {
        id: 'ready-now',
        title: 'Ready',
        count: 2,
        rows: [
          {
            id: 'r1',
            vehicleId: 'v1',
            title: 'KS-AB 100',
            subtitle: 'VW Golf',
            stationLabel: 'Zentrale',
            severity: 'success' as const,
          },
          {
            id: 'r2',
            vehicleId: 'v2',
            title: 'M-XY 200',
            subtitle: 'Audi A4',
            stationLabel: 'Flughafen',
            severity: 'success' as const,
          },
        ],
      },
    ];
    const states = new Map([
      ['v1', { vehicleId: 'v1', license: 'KS-AB 100', displayName: 'KS-AB 100 · VW Golf', stationLabel: 'Zentrale' } as any],
      ['v2', { vehicleId: 'v2', license: 'M-XY 200', displayName: 'M-XY 200 · Audi A4', stationLabel: 'Flughafen' } as any],
    ]);

    expect(filterReadyToRentDrawerGroups(groups, states, 'golf')[0]?.rows).toHaveLength(1);
    expect(filterReadyToRentDrawerGroups(groups, states, 'zentrale')[0]?.rows[0]?.vehicleId).toBe('v1');
    expect(filterReadyToRentDrawerGroups(groups, states, 'nomatch')).toHaveLength(0);
    expect(filterReadyToRentDrawerGroups(groups, states, '')).toEqual(groups);
  });
});
