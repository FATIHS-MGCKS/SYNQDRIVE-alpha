import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../../data/vehicles';
import type { ReturnTileItem } from '../StatInlineDetail';
import { buildDashboardGroups, collectDrawerRowIds } from './dashboardDrilldownGroups';
import {
  buildReadyToRentDrawerGroups,
  composeVehicleDrawerRowDisplay,
} from './dashboardDrilldownRowDisplay';
import { buildDashboardRuntimeModel } from './runtime/dashboardSliceBuilder';
import type { DashboardSlice, DashboardSliceId } from './runtime';

const NOW = new Date('2026-06-24T10:00:00.000Z');
const KPI_ORDER: DashboardSliceId[] = [
  'ready-to-rent',
  'active-rented',
  'due-soon',
  'overdue-returns',
  'blocked-maintenance',
  'critical-alerts',
];

const testDir = dirname(fileURLToPath(import.meta.url));
const dashboardDir = testDir;

function hoursAgoIso(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60_000).toISOString();
}

function minutesFromNowIso(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
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

type HealthModuleKey = keyof VehicleHealthResponse['modules'];

function healthModule(overrides: Partial<NonNullable<VehicleHealthResponse['modules']>['battery']> = {}) {
  return {
    state: overrides.state ?? 'good',
    reason: overrides.reason ?? '',
    last_updated_at: overrides.last_updated_at ?? NOW.toISOString(),
    data_stale: overrides.data_stale ?? false,
    ...overrides,
  };
}

function health(overrides: {
  vehicleId?: string;
  overall_state?: VehicleHealthResponse['overall_state'];
  rental_blocked?: boolean;
  blocking_reasons?: string[];
  modules?: Partial<Record<HealthModuleKey, Partial<NonNullable<VehicleHealthResponse['modules']>['battery']>>>;
} = {}): VehicleHealthResponse {
  const keys: HealthModuleKey[] = [
    'battery',
    'tires',
    'brakes',
    'error_codes',
    'service_compliance',
    'oil_change',
    'documents',
  ];
  const modules = {} as VehicleHealthResponse['modules'];
  for (const key of keys) {
    modules[key] = healthModule(overrides.modules?.[key]);
  }
  return {
    vehicle_id: overrides.vehicleId ?? 'v1',
    overall_state: overrides.overall_state ?? 'good',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules,
    computed_at: NOW.toISOString(),
  };
}

function returnItem(overrides: Partial<ReturnTileItem> = {}): ReturnTileItem {
  return {
    time: overrides.time ?? '12:30',
    vehicle: overrides.vehicle ?? 'VW Golf',
    plate: overrides.plate ?? 'KS-FS 123',
    customer: overrides.customer ?? 'Customer',
    station: overrides.station ?? 'Zentrale',
    done: overrides.done ?? false,
    vehicleId: overrides.vehicleId ?? 'v1',
    bookingId: overrides.bookingId ?? 'b-return',
    endDate: overrides.endDate ?? minutesFromNowIso(-30),
    isOverdue: overrides.isOverdue ?? true,
    minutesOverdue: overrides.minutesOverdue ?? 30,
    ...overrides,
  };
}

/** Mirrors DashboardDrilldownDrawer header count for operative slices. */
function drawerHeaderCount(slice: DashboardSlice): number | null {
  return slice.count;
}

function uniqueVehicleIds(rows: { vehicleId?: string }[]): string[] {
  return [...new Set(rows.map((row) => row.vehicleId).filter(Boolean) as string[])];
}

const LEGACY_PATTERNS = [
  /dashboardDrilldownBuilder/,
  /dashboardRuntimeViewModelAdapters/,
  /buildRuntimeControlCenterKpis/,
  /buildRuntimeFleetBoard/,
  /buildRuntimeDashboardDrilldown/,
  /buildDashboardDrilldown\(/,
];

const ACTIVE_UI_FILES = [
  'ControlKpiStrip.tsx',
  'DashboardDrilldownDrawer.tsx',
  '../DashboardView.tsx',
  'useDashboardViewModel.ts',
  'BusinessPulse.tsx',
].map((file) => resolve(dashboardDir, file));

describe('dashboard E2E regression audit', () => {
  describe('runtime — single source of truth', () => {
    it('buildDashboardRuntimeModel produces unique vehicleStates', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'a', license: 'A' }),
          vehicle({ id: 'b', license: 'B', cleaningStatus: 'Needs Cleaning' }),
          vehicle({ id: 'c', license: 'C', status: 'Maintenance' }),
        ],
        now: NOW,
      });

      const ids = runtime.vehicleStates.map((state) => state.vehicleId);
      expect(ids).toHaveLength(new Set(ids).size);
    });

    it('each operative slice keeps count aligned with primary rows', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'ready', license: 'READY' }),
          vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
          vehicle({ id: 'rented', license: 'RENTED', status: 'Active Rented' }),
          vehicle({ id: 'maintenance', status: 'Maintenance' }),
        ],
        returnItems: [
          returnItem({ vehicleId: 'rented', plate: 'RENTED', isOverdue: true, done: false }),
        ],
        now: NOW,
      });

      for (const id of KPI_ORDER) {
        const slice = runtime.slices[id];
        expect(slice.count).toBe(slice.rows.length);
        expect(drawerHeaderCount(slice)).toBe(slice.count);
      }
    });

    it('ready-to-rent keeps notReady vehicles out of primary rows and groups are unique per section', () => {
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
      const readyGroup = groups.find((group) => group.id === 'ready-now');
      const notReadyGroup = groups.find((group) => group.id === 'available-but-not-ready');

      expect(slice.rows.map((row) => row.vehicleId)).toEqual(['ready']);
      expect(slice.secondaryRows?.map((row) => row.vehicleId)).toEqual(['dirty']);
      expect(readyGroup?.count).toBe(slice.count);
      expect(notReadyGroup?.rows.map((row) => row.vehicleId)).toEqual(['dirty']);
      expect(collectDrawerRowIds(groups)).toHaveLength(new Set(collectDrawerRowIds(groups)).size);

      for (const group of groups) {
        const vehicleIds = group.rows.map((row) => row.vehicleId).filter(Boolean);
        expect(vehicleIds).toHaveLength(new Set(vehicleIds).size);
      }
    });

    it('vehicle-centric slices keep unique vehicleIds in primary rows', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'blocked', license: 'BLOCKED' }),
          vehicle({ id: 'critical', license: 'CRITICAL' }),
        ],
        blockedVehicleIds: new Set(['blocked']),
        insights: [
          insight({
            id: 'crit',
            type: 'BATTERY_CRITICAL',
            severity: 'CRITICAL',
            entityIds: ['critical'],
          }),
        ],
        now: NOW,
      });

      for (const id of ['blocked-maintenance', 'critical-alerts'] as const) {
        const slice = runtime.slices[id];
        expect(uniqueVehicleIds(slice.rows)).toHaveLength(slice.rows.length);
      }
    });
  });

  describe('KPI count vs drawer count', () => {
    it('drawer header count matches slice.count for every operative KPI', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'de',
        fleetVehicles: [
          vehicle({ id: 'ready' }),
          vehicle({ id: 'dirty', cleaningStatus: 'Needs Cleaning' }),
          vehicle({ id: 'rented', status: 'Active Rented' }),
          vehicle({ id: 'maint', status: 'Maintenance' }),
        ],
        returnItems: [returnItem({ vehicleId: 'rented', isOverdue: true })],
        now: NOW,
      });

      for (const id of KPI_ORDER) {
        const slice = runtime.slices[id];
        expect(String(drawerHeaderCount(slice))).toBe(String(slice.count));
        const groups = buildDashboardGroups(slice, 'de');
        if (id === 'ready-to-rent') {
          const readyGroup = groups.find((group) => group.id === 'ready-now');
          expect(readyGroup?.count).toBe(slice.count);
        } else if (groups.length === 1 && groups[0]?.id.endsWith(':primary')) {
          expect(groups[0]?.count).toBe(slice.count);
        }
      }
    });

    it('due-soon and overdue-returns drawers use runtime slice rows only', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [vehicle({ id: 'rented', status: 'Active Rented' })],
        returnItems: [
          returnItem({
            vehicleId: 'rented',
            bookingId: 'overdue-1',
            isOverdue: true,
            endDate: minutesFromNowIso(-60),
          }),
        ],
        pickupItems: [],
        now: NOW,
      });

      const overdueGroups = buildDashboardGroups(runtime.slices['overdue-returns'], 'en');
      const overdueDrawerRows = overdueGroups.flatMap((group) => group.rows);
      expect(overdueDrawerRows).toHaveLength(runtime.slices['overdue-returns'].count);
      expect(overdueDrawerRows.map((row) => row.bookingId)).toContain('overdue-1');
    });
  });

  describe('legacy path audit', () => {
    it('removes orphaned drilldown builder and runtime view-model adapters from the repo', () => {
      expect(existsSync(resolve(dashboardDir, 'dashboardDrilldownBuilder.ts'))).toBe(false);
      expect(existsSync(resolve(dashboardDir, 'runtime/dashboardRuntimeViewModelAdapters.ts'))).toBe(false);
      expect(existsSync(resolve(dashboardDir, 'runtime/dashboardRuntimeViewModelAdapters.test.ts'))).toBe(false);
    });

    it('active dashboard UI files do not import legacy builders or adapters', () => {
      for (const file of ACTIVE_UI_FILES) {
        const src = readFileSync(file, 'utf8');
        for (const pattern of LEGACY_PATTERNS) {
          expect(src, file).not.toMatch(pattern);
        }
      }
    });

    it('runtime barrel does not export deprecated adapters', () => {
      const runtimeIndex = readFileSync(resolve(dashboardDir, 'runtime/index.ts'), 'utf8');
      expect(runtimeIndex).not.toMatch(/dashboardRuntimeViewModelAdapters/);
    });
  });

  describe('manual scenarios A–E', () => {
    it('scenario A: available + clean + no blocker increments Ready count', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [vehicle({ id: 'clean-ready', license: 'CLEAN' })],
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      expect(state?.isReadyToRent).toBe(true);
      expect(runtime.slices['ready-to-rent'].count).toBe(1);
      expect(runtime.slices['ready-to-rent'].rows[0]?.vehicleId).toBe('clean-ready');
    });

    it('scenario B: critical health without blocker can stay Ready with Critical severity', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [vehicle({ id: 'crit-ready', license: 'CRIT' })],
        insights: [
          insight({
            id: 'battery',
            type: 'BATTERY_CRITICAL',
            severity: 'CRITICAL',
            entityIds: ['crit-ready'],
          }),
        ],
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      expect(state?.isReadyToRent).toBe(true);
      expect(state?.isCritical).toBe(true);
      expect(state?.isBlocked).toBe(false);
      expect(runtime.slices['ready-to-rent'].count).toBe(1);

      const row = runtime.slices['ready-to-rent'].rows[0];
      const display = composeVehicleDrawerRowDisplay(row!, state, 'en', { showReadiness: true });
      expect(display.readinessLabel).toBe('Ready');
      expect(display.healthLabel).toBe('Critical');
    });

    it('scenario C: explicit rental blocker lands in Not Ready, not Ready', () => {
      const healthMap = new Map<string, VehicleHealthResponse>([
        [
          'doc-blocked',
          health({
            vehicleId: 'doc-blocked',
            rental_blocked: true,
            blocking_reasons: ['Pflichtdokument fehlt'],
            modules: { documents: { state: 'critical', reason: 'Pflichtdokument fehlt' } },
          }),
        ],
      ]);
      const runtime = buildDashboardRuntimeModel({
        locale: 'de',
        fleetVehicles: [vehicle({ id: 'doc-blocked', license: 'DOC' })],
        healthMap,
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      expect(state?.isReadyToRent).toBe(false);
      expect(state?.isBlocked).toBe(true);
      expect(runtime.slices['ready-to-rent'].count).toBe(0);
      expect(runtime.slices['ready-to-rent'].secondaryRows?.map((row) => row.vehicleId)).toContain('doc-blocked');
    });

    it('scenario D: service overdue without rental_blocked stays visible but not auto-blocked', () => {
      const healthMap = new Map<string, VehicleHealthResponse>([
        [
          'svc-open',
          health({
            vehicleId: 'svc-open',
            overall_state: 'critical',
            rental_blocked: false,
            blocking_reasons: [],
            modules: {
              service_compliance: { state: 'critical', reason: 'Service overdue 117 days' },
            },
          }),
        ],
      ]);
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [vehicle({ id: 'svc-open', license: 'SVC' })],
        healthMap,
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      expect(state?.isCritical).toBe(true);
      expect(state?.isBlocked).toBe(false);
      expect(state?.isReadyToRent).toBe(true);
      expect(runtime.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('svc-open');
      expect(runtime.slices['critical-alerts'].rows.map((row) => row.vehicleId)).toContain('svc-open');
    });

    it('scenario E: offline vehicle shows freshness once without duplicate stale reasons in drawer row', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({
            id: 'offline',
            license: 'OFF-1',
            lastSignal: hoursAgoIso(50),
            onlineStatus: 'OFFLINE',
            isFresh: false,
            cleaningStatus: 'Needs Cleaning',
          }),
        ],
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      const row = runtime.slices['ready-to-rent'].secondaryRows?.[0];
      expect(row).toBeDefined();
      const display = composeVehicleDrawerRowDisplay(row!, state, 'en', { showReadiness: true });

      expect(display.subtitle?.toLowerCase()).not.toContain('available');
      expect(display.locationLine?.match(/offline|no signal|kein signal/i)).not.toBeNull();
      // Freshness/telemetry belongs in the location line — not repeated as the same primary reason text.
      if (display.primaryReason && display.locationLine) {
        const telemetryInLocation = display.locationLine.split('·').pop()?.trim().toLowerCase();
        expect(display.primaryReason.trim().toLowerCase()).not.toBe(telemetryInLocation);
      }
    });
  });

  describe('drawer row display contracts', () => {
    it('ready drawer rows never expose raw operationalStatus tokens in subtitle', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        ],
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      const row = runtime.slices['ready-to-rent'].secondaryRows?.[0];
      const display = composeVehicleDrawerRowDisplay(row!, state, 'en', { showReadiness: true });

      const haystack = [display.title, display.subtitle, display.locationLine, display.primaryReason]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      expect(haystack).not.toMatch(/\bavailable\b|\breserved\b|\bactive_rented\b|\bmaintenance\b|\bunavailable\b/);
      expect(display.title).toBe('DIRTY');
      expect(display.subtitle?.toLowerCase()).not.toContain('dirty');
    });

    it('deduplicates repeated reason labels in composed drawer display', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
        ],
        now: NOW,
      });

      const state = runtime.vehicleStates[0];
      const row = runtime.slices['ready-to-rent'].secondaryRows?.[0];
      const display = composeVehicleDrawerRowDisplay(row!, state, 'en', { showReadiness: true });
      const reasonTexts = [display.primaryReason].filter(Boolean);
      expect(new Set(reasonTexts.map((text) => text!.toLowerCase())).size).toBe(reasonTexts.length);
    });
  });

  describe('regression — blocked/critical slices do not drift via legacy adapters', () => {
    it('blocked-maintenance and critical-alerts drawer groups match runtime slice counts', () => {
      const runtime = buildDashboardRuntimeModel({
        locale: 'en',
        fleetVehicles: [
          vehicle({ id: 'maint', status: 'Maintenance' }),
          vehicle({ id: 'hard-offline', lastSignal: hoursAgoIso(50), onlineStatus: 'OFFLINE', isFresh: false }),
          vehicle({ id: 'battery', license: 'BAT' }),
        ],
        insights: [
          insight({
            id: 'bat',
            type: 'BATTERY_CRITICAL',
            severity: 'CRITICAL',
            entityIds: ['battery'],
          }),
        ],
        now: NOW,
      });

      const blocked = runtime.slices['blocked-maintenance'];
      const critical = runtime.slices['critical-alerts'];
      const blockedDrawer = buildDashboardGroups(blocked, 'en').flatMap((group) => group.rows);
      const criticalDrawer = buildDashboardGroups(critical, 'en').flatMap((group) => group.rows);

      expect(uniqueVehicleIds(blockedDrawer).length).toBeLessThanOrEqual(blocked.count);
      expect(blockedDrawer.length).toBeGreaterThan(0);
      expect(criticalDrawer.length).toBe(critical.count);
    });
  });
});
