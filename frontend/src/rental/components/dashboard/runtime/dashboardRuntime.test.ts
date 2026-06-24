import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import { buildDashboardRuntimeModel } from './dashboardSliceBuilder';
import { buildVehicleRuntimeStates, deriveTelemetryState } from './vehicleRuntimeStateBuilder';

const NOW = new Date('2026-06-23T12:00:00.000Z');

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

function pickup(overrides: Partial<PickupTileItem> = {}): PickupTileItem {
  return {
    time: overrides.time ?? '12:30',
    vehicle: overrides.vehicle ?? 'VW Golf',
    plate: overrides.plate ?? 'KS-FS 123',
    customer: overrides.customer ?? 'Customer',
    station: overrides.station ?? 'Zentrale',
    done: overrides.done ?? false,
    vehicleId: overrides.vehicleId ?? 'v1',
    needsCleaning: overrides.needsCleaning ?? false,
    hasAlert: overrides.hasAlert ?? false,
    hasError: overrides.hasError ?? false,
    bookingId: overrides.bookingId ?? 'b-pickup',
    startDate: overrides.startDate ?? minutesFromNowIso(30),
    endDate: overrides.endDate ?? minutesFromNowIso(180),
    isOverdue: overrides.isOverdue ?? false,
    minutesOverdue: overrides.minutesOverdue ?? 0,
    ...overrides,
  };
}

function returnItem(overrides: Partial<ReturnTileItem> = {}): ReturnTileItem {
  return {
    time: overrides.time ?? '12:45',
    vehicle: overrides.vehicle ?? 'VW Golf',
    plate: overrides.plate ?? 'KS-FS 123',
    customer: overrides.customer ?? 'Customer',
    station: overrides.station ?? 'Zentrale',
    done: overrides.done ?? false,
    vehicleId: overrides.vehicleId ?? 'v1',
    hasError: overrides.hasError ?? false,
    kmExceeded: overrides.kmExceeded ?? false,
    extraKm: overrides.extraKm ?? null,
    isOverdue: overrides.isOverdue ?? false,
    returnProtocolStatus: overrides.returnProtocolStatus ?? null,
    hasAlert: overrides.hasAlert ?? false,
    bookingId: overrides.bookingId ?? 'b-return',
    startDate: overrides.startDate ?? minutesFromNowIso(-180),
    endDate: overrides.endDate ?? minutesFromNowIso(45),
    pickupOdometerKm: overrides.pickupOdometerKm ?? null,
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

describe('dashboard runtime model', () => {
  it('prevents ready-to-rent count drift between count, rows and secondaryRows', () => {
    const fleetVehicles = [
      vehicle({ id: 'ready', license: 'READY' }),
      vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      vehicle({ id: 'health-risk', license: 'HEALTH' }),
      vehicle({ id: 'blocked', license: 'BLOCKED' }),
    ];

    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles,
      healthRiskVehicleIds: new Set(['health-risk']),
      blockedVehicleIds: new Set(['blocked']),
      now: NOW,
    });

    const slice = model.slices['ready-to-rent'];
    const healthRiskState = model.vehicleStates.find((state) => state.vehicleId === 'health-risk');
    expect(slice.count).toBe(1);
    expect(slice.rows).toHaveLength(1);
    expect(slice.rows[0]?.vehicleId).toBe('ready');
    expect(slice.secondaryRows).toHaveLength(3);
    expect(healthRiskState?.rentalReadiness).toBe('not_ready');
    expect(healthRiskState?.isBlocked).toBe(false);
    expect(slice.secondaryRows?.every((row) => (row.reasons?.length ?? 0) > 0)).toBe(true);
    expect(slice.rows.map((row) => row.vehicleId)).not.toContain('dirty');
    expect(slice.rows.map((row) => row.vehicleId)).not.toContain('health-risk');
    expect(slice.rows.map((row) => row.vehicleId)).not.toContain('blocked');
  });

  it('keeps blocked-maintenance scoped to maintenance, hard blocks and unavailable vehicles', () => {
    const fleetVehicles = [
      vehicle({ id: 'maintenance', status: 'Maintenance' }),
      vehicle({ id: 'blocked' }),
      vehicle({ id: 'warning-only' }),
      vehicle({ id: 'standby', lastSignal: hoursAgoIso(3), onlineStatus: 'STANDBY', isFresh: false }),
    ];

    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles,
      blockedVehicleIds: new Set(['blocked']),
      insights: [
        insight({
          id: 'warning-only',
          type: 'SERVICE_WINDOW',
          severity: 'WARNING',
          title: 'Service soon',
          entityIds: ['warning-only'],
        }),
      ],
      now: NOW,
    });

    const rows = model.slices['blocked-maintenance'].rows;
    const warningOnlyState = model.vehicleStates.find((state) => state.vehicleId === 'warning-only');
    expect(model.slices['blocked-maintenance'].count).toBe(2);
    expect(warningOnlyState?.isWarning).toBe(true);
    expect(warningOnlyState?.isBlocked).toBe(false);
    expect(rows.map((row) => row.vehicleId).sort()).toEqual(['blocked', 'maintenance']);
    expect(rows.map((row) => row.vehicleId)).not.toContain('warning-only');
    expect(rows.map((row) => row.vehicleId)).not.toContain('standby');
  });

  it('does not turn a critical available vehicle into maintenance', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'critical-available', status: 'Available' })],
      insights: [
        insight({
          id: 'critical-insight',
          type: 'BATTERY_CRITICAL',
          severity: 'CRITICAL',
          entityIds: ['critical-available'],
        }),
      ],
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.isCritical).toBe(true);
    expect(state?.isBlocked).toBe(true);
    expect(state?.isMaintenance).toBe(false);
    expect(state?.operationalStatus).toBe('available');
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).toContain('critical-available');
    expect(model.slices['blocked-maintenance'].groups?.find((group) => group.id === 'in-maintenance')?.rows).toHaveLength(0);
  });

  it('treats 3h without heartbeat as standby, not a warning or block', () => {
    const states = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle({ id: 'standby', lastSignal: hoursAgoIso(3), onlineStatus: 'STANDBY', isFresh: false })],
      now: NOW,
    });

    const state = states[0];
    expect(state?.telemetryState).toBe('standby');
    expect(state?.warningReasons.some((reason) => reason.title.toLowerCase().includes('stale'))).toBe(false);
    expect(state?.warningReasons.some((reason) => reason.category === 'telemetry')).toBe(false);
    expect(state?.criticalReasons).toHaveLength(0);
    expect(state?.isBlocked).toBe(false);
  });

  it('separates soft offline from hard offline defaults', () => {
    const states = buildVehicleRuntimeStates({
      fleetVehicles: [
        vehicle({ id: 'soft', lastSignal: hoursAgoIso(25), onlineStatus: 'OFFLINE', isFresh: false }),
        vehicle({ id: 'hard', lastSignal: hoursAgoIso(49), onlineStatus: 'OFFLINE', isFresh: false }),
      ],
      now: NOW,
    });

    const soft = states.find((state) => state.vehicleId === 'soft');
    const hard = states.find((state) => state.vehicleId === 'hard');
    expect(soft?.telemetryState).toBe('soft_offline');
    expect(soft?.warningReasons.some((reason) => reason.category === 'telemetry')).toBe(true);
    expect(soft?.isBlocked).toBe(false);
    expect(hard?.telemetryState).toBe('offline');
    expect(hard?.criticalReasons.some((reason) => reason.category === 'telemetry')).toBe(true);
    expect(hard?.blockReasons.some((reason) => reason.category === 'telemetry')).toBe(true);
    expect(hard?.isBlocked).toBe(true);
  });

  it('keeps active rented vehicles active when their return is overdue', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'rented', status: 'Active Rented', license: 'RENTED' })],
      returnItems: [
        returnItem({
          vehicleId: 'rented',
          plate: 'RENTED',
          bookingId: 'booking-overdue',
          isOverdue: true,
          endDate: minutesFromNowIso(-30),
        }),
      ],
      now: NOW,
    });

    expect(model.slices['active-rented'].rows.map((row) => row.vehicleId)).toContain('rented');
    expect(model.slices['overdue-returns'].rows.map((row) => row.bookingId)).toContain('booking-overdue');
  });

  it('does not mix overdue returns into due-soon', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'pickup-v', license: 'PICKUP' }),
        vehicle({ id: 'return-v', license: 'RETURN' }),
        vehicle({ id: 'overdue-v', license: 'OVERDUE' }),
      ],
      pickupItems: [
        pickup({
          vehicleId: 'pickup-v',
          plate: 'PICKUP',
          bookingId: 'pickup-due',
          startDate: minutesFromNowIso(30),
        }),
      ],
      returnItems: [
        returnItem({
          vehicleId: 'return-v',
          plate: 'RETURN',
          bookingId: 'return-due',
          endDate: minutesFromNowIso(45),
        }),
        returnItem({
          vehicleId: 'overdue-v',
          plate: 'OVERDUE',
          bookingId: 'return-overdue',
          isOverdue: true,
          endDate: minutesFromNowIso(-45),
        }),
      ],
      now: NOW,
    });

    expect(model.slices['due-soon'].count).toBe(2);
    expect(model.slices['overdue-returns'].count).toBe(1);
    expect(model.slices['due-soon'].rows.map((row) => row.bookingId)).not.toContain('return-overdue');
  });

  it('deduplicates critical alerts by vehicle/category/source/title', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'critical', license: 'CRIT' })],
      insights: [
        insight({
          id: 'critical-1',
          type: 'BATTERY_CRITICAL',
          severity: 'CRITICAL',
          title: 'Battery critical',
          entityIds: ['critical'],
        }),
        insight({
          id: 'critical-2',
          type: 'BATTERY_CRITICAL',
          severity: 'CRITICAL',
          title: 'Battery critical',
          entityIds: ['critical'],
        }),
      ],
      now: NOW,
    });

    expect(model.slices['critical-alerts'].count).toBe(1);
    expect(model.slices['critical-alerts'].rows).toHaveLength(1);
  });

  it('does not crash on missing optional inputs or unusable telemetry timestamps', () => {
    const state = buildVehicleRuntimeStates({
      fleetVehicles: [vehicle({ id: 'missing-telemetry', lastSignal: '', signalAgeMs: undefined })],
      now: NOW,
    })[0];

    expect(state?.telemetryState).toBe('unknown');
    expect(deriveTelemetryState(vehicle({ lastSignal: '' }), NOW)).toBe('unknown');
  });
});
