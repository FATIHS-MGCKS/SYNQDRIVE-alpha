import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VehicleData } from '../../../data/vehicles';
import { buildDashboardGroups, collectDrawerRowIds } from './dashboardDrilldownGroups';
import { readyToRentNotReadyRows, resolveReadyForRentingKpiCounts } from './dashboardSliceAccess';
import { buildDashboardRuntimeModel } from './runtime/dashboardSliceBuilder';
import type { DashboardSliceId } from './runtime';

const NOW = new Date('2026-06-24T10:00:00.000Z');
const KPI_ORDER: DashboardSliceId[] = [
  'ready-to-rent',
  'active-rented',
  'due-soon',
  'overdue-returns',
  'blocked-maintenance',
  'critical-alerts',
];

function hoursAgoIso(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60_000).toISOString();
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS-FS 123',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? hoursAgoIso(1),
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
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

const testDir = dirname(fileURLToPath(import.meta.url));

describe('dashboard runtime-only UI contracts', () => {
  it('keeps KPI counts aligned with dashboardRuntime.slices', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'blocked', license: 'BLOCKED' }),
        vehicle({ id: 'maintenance', status: 'Maintenance' }),
      ],
      blockedVehicleIds: new Set(['blocked']),
      now: NOW,
    });

    for (const id of KPI_ORDER) {
      const slice = runtime.slices[id];
      expect(slice.count).toBe(slice.rows.length);
    }

    expect(runtime.slices['ready-to-rent'].count).toBe(1);
    expect(runtime.slices['blocked-maintenance'].count).toBe(2);
    expect(runtime.slices['blocked-maintenance'].id).toBe('blocked-maintenance');
  });

  it('deduplicates ready-to-rent available-but-not-ready drawer groups', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'offline', license: 'OFFLINE', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const groups = buildDashboardGroups(slice, 'en');
    const notReadyGroups = groups.filter((group) => group.id === 'available-but-not-ready');

    expect(notReadyGroups).toHaveLength(1);
    expect(notReadyGroups[0]?.title).toBe('Not Ready');
    expect(notReadyGroups[0]?.count).toBe(2);
    expect(collectDrawerRowIds(groups)).toHaveLength(new Set(collectDrawerRowIds(groups)).size);
    expect(slice.secondaryRows).toHaveLength(2);
  });

  it('uses runtime groups for blocked-maintenance and critical-alerts drawers', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'blocked', license: 'BLOCKED' }),
        vehicle({
          id: 'critical',
          license: 'CRITICAL',
          healthStatus: 'Critical Health',
        }),
      ],
      blockedVehicleIds: new Set(['blocked']),
      healthRiskVehicleIds: new Set(['critical']),
      now: NOW,
    });

    const blockedGroups = buildDashboardGroups(runtime.slices['blocked-maintenance'], 'en');
    const criticalGroups = buildDashboardGroups(runtime.slices['critical-alerts'], 'en');

    expect(blockedGroups.length).toBeGreaterThan(0);
    expect(blockedGroups.flatMap((group) => group.rows).map((row) => row.vehicleId)).toContain('blocked');
    expect(criticalGroups.flatMap((group) => group.rows).length).toBe(runtime.slices['critical-alerts'].count);
  });

  it('does not import legacy dashboard drilldown or adapter builders', () => {
    const drawerSrc = readFileSync(resolve(testDir, './DashboardDrilldownDrawer.tsx'), 'utf8');
    const viewModelSrc = readFileSync(resolve(testDir, './useDashboardViewModel.ts'), 'utf8');
    const runtimeIndexSrc = readFileSync(resolve(testDir, './runtime/index.ts'), 'utf8');
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
    const businessPulseSrc = readFileSync(resolve(testDir, './BusinessPulse.tsx'), 'utf8');

    expect(drawerSrc).not.toMatch(/dashboardDrilldownBuilder|dashboardRuntimeViewModelAdapters/);
    expect(viewModelSrc).not.toMatch(/dashboardDrilldownBuilder|dashboardRuntimeViewModelAdapters|buildControlCenterKpis|buildFleetBoard|buildDashboardDrilldown|buildRuntimeControlCenterKpis|buildRuntimeFleetBoard/);
    expect(runtimeIndexSrc).not.toMatch(/dashboardRuntimeViewModelAdapters/);
    expect(dashboardViewSrc).toMatch(/dashboardRuntime=\{vm\.dashboardRuntime\}/);
    expect(dashboardViewSrc).toMatch(/businessPulseSlices=\{vm\.businessPulseSlices\}/);
    expect(businessPulseSrc).toMatch(/businessPulseSlices/);
    expect(existsSync(resolve(testDir, 'dashboardDrilldownBuilder.ts'))).toBe(false);
    expect(existsSync(resolve(testDir, 'runtime/dashboardRuntimeViewModelAdapters.ts'))).toBe(false);
  });

  it('reads not-ready rows from groups only via dashboardSliceAccess', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    const notReady = readyToRentNotReadyRows(slice);
    const groups = buildDashboardGroups(slice, 'en');

    expect(notReady.map((row) => row.vehicleId)).toEqual(['dirty']);
    expect(notReady).toEqual(slice.groups?.find((group) => group.id === 'available-but-not-ready')?.rows);
    expect(groups.filter((group) => group.id === 'available-but-not-ready')).toHaveLength(1);
    expect(collectDrawerRowIds(groups)).toHaveLength(new Set(collectDrawerRowIds(groups)).size);
  });

  it('resolves ready-for-renting KPI counts from runtime slice groups only', () => {
    const runtime = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'r1', license: 'R1' }),
        vehicle({ id: 'r2', license: 'R2' }),
        vehicle({ id: 'r3', license: 'R3' }),
        vehicle({ id: 'r4', license: 'R4' }),
        vehicle({ id: 'r5', license: 'R5' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const slice = runtime.slices['ready-to-rent'];
    expect(slice.title).toBe('Ready for Renting');
    expect(resolveReadyForRentingKpiCounts(slice)).toEqual({
      readyCount: 5,
      availableCount: 6,
      notReadyCount: 1,
    });
  });
});
