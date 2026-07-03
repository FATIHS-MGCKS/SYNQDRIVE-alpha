import { describe, expect, it } from 'vitest';
import type {
  RentalHealthModule,
  RentalHealthState,
  VehicleHealthResponse,
} from '../../../../lib/api';
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

type HealthModuleKey = keyof VehicleHealthResponse['modules'];

function healthModule(overrides: Partial<RentalHealthModule> = {}): RentalHealthModule {
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
  overall_state?: RentalHealthState;
  rental_blocked?: boolean;
  blocking_reasons?: string[];
  modules?: Partial<Record<HealthModuleKey, Partial<RentalHealthModule>>>;
} = {}): VehicleHealthResponse {
  const keys: HealthModuleKey[] = [
    'battery',
    'tires',
    'brakes',
    'error_codes',
    'service_compliance',
    'complaints',
    'vehicle_alerts',
  ];
  const modules = keys.reduce((acc, key) => {
    acc[key] = healthModule(overrides.modules?.[key]);
    return acc;
  }, {} as VehicleHealthResponse['modules']);

  return {
    vehicle_id: overrides.vehicleId ?? 'v1',
    organization_id: 'org-1',
    overall_state: overrides.overall_state ?? 'good',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: overrides.blocking_reasons ?? [],
    modules,
    generated_at: NOW.toISOString(),
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
    // A generic health-risk hint (no concrete rental-health reason) is a soft,
    // non-blocking fallback and must not push the vehicle out of Ready-to-rent.
    expect(slice.count).toBe(2);
    expect(slice.rows).toHaveLength(2);
    expect(slice.count).toBe(slice.rows.length);
    expect(slice.rows.map((row) => row.vehicleId).sort()).toEqual(['health-risk', 'ready']);
    expect(slice.secondaryRows).toHaveLength(2);
    expect(healthRiskState?.rentalReadiness).toBe('ready');
    expect(healthRiskState?.isReadyToRent).toBe(true);
    expect(healthRiskState?.isBlocked).toBe(false);
    expect(slice.secondaryRows?.every((row) => (row.reasons?.length ?? 0) > 0)).toBe(true);
    expect(slice.rows.map((row) => row.vehicleId)).not.toContain('dirty');
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
    expect(state?.isBlocked).toBe(false);
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.isMaintenance).toBe(false);
    expect(state?.operationalStatus).toBe('available');
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('critical-available');
    expect(model.slices['critical-alerts'].rows.map((row) => row.vehicleId)).toContain('critical-available');
    expect(model.slices['blocked-maintenance'].groups?.find((group) => group.id === 'in-maintenance')?.rows).toHaveLength(0);
  });

  it('keeps HM/OEM service overdue critical visible without blocking rental when no canonical blocker exists', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-overdue-open',
        health({
          vehicleId: 'svc-overdue-open',
          overall_state: 'critical',
          rental_blocked: false,
          blocking_reasons: [],
          modules: {
            service_compliance: {
              state: 'critical',
              reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
            },
          },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'svc-overdue-open', license: 'SVC-OPEN' })],
      healthMap,
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.complianceSeverity).toBe('unknown');
    expect(state?.healthSeverity).toBe('critical');
    expect(state?.criticalReasons.some((reason) => reason.title.includes('Service überfällig'))).toBe(true);
    expect(state?.blockReasons.some((reason) => reason.title.includes('Service überfällig'))).toBe(false);
    expect(state?.notReadyReasons.some((reason) => reason.title.includes('Service überfällig'))).toBe(false);
    expect(state?.blockLevel).toBe('none');
    expect(state?.isBlocked).toBe(false);
    expect(state?.isMaintenance).toBe(false);
    expect(state?.isReadyToRent).toBe(true);
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('svc-overdue-open');
    expect(model.slices['critical-alerts'].rows.map((row) => row.vehicleId)).toContain('svc-overdue-open');
  });

  it('dedupes SERVICE_OVERDUE insight when runtime already has service_compliance critical', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-overdue-open',
        health({
          vehicleId: 'svc-overdue-open',
          overall_state: 'critical',
          rental_blocked: false,
          blocking_reasons: [],
          modules: {
            service_compliance: {
              state: 'critical',
              reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
            },
          },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'svc-overdue-open', license: 'SVC-OPEN' })],
      healthMap,
      insights: [
        insight({
          id: 'service-insight',
          type: 'SERVICE_OVERDUE',
          severity: 'CRITICAL',
          title: 'Service überfällig',
          entityIds: ['svc-overdue-open'],
        }),
      ],
      now: NOW,
    });

    const serviceRows = model.slices['critical-alerts'].rows.filter(
      (row) => row.vehicleId === 'svc-overdue-open',
    );
    expect(serviceRows).toHaveLength(1);
    expect(model.slices['critical-alerts'].count).toBe(1);
    expect(serviceRows[0]?.reasons?.[0]?.blocking).toBe(false);
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

  it('builds overdue-pickups from overdue pickup items only', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'pickup-overdue', license: 'OVERDUE' }),
        vehicle({ id: 'pickup-due', license: 'DUE' }),
        vehicle({ id: 'pickup-done', license: 'DONE' }),
      ],
      pickupItems: [
        pickup({
          vehicleId: 'pickup-overdue',
          plate: 'OVERDUE',
          bookingId: 'pickup-overdue-1',
          isOverdue: true,
          startDate: minutesFromNowIso(-60),
        }),
        pickup({
          vehicleId: 'pickup-due',
          plate: 'DUE',
          bookingId: 'pickup-due-1',
          isOverdue: false,
          startDate: minutesFromNowIso(30),
        }),
        pickup({
          vehicleId: 'pickup-done',
          plate: 'DONE',
          bookingId: 'pickup-done-1',
          isOverdue: true,
          done: true,
          startDate: minutesFromNowIso(-90),
        }),
      ],
      now: NOW,
    });

    const slice = model.slices['overdue-pickups'];
    expect(slice.count).toBe(1);
    expect(slice.rows.map((row) => row.bookingId)).toEqual(['pickup-overdue-1']);
    expect(slice.rows[0]?.severity).toBe('critical');
    expect(slice.tone).toBe('critical');
  });

  it('shows calm success tone when there are zero overdue pickups', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'pickup-due', license: 'DUE' })],
      pickupItems: [
        pickup({
          vehicleId: 'pickup-due',
          plate: 'DUE',
          bookingId: 'pickup-due-1',
          isOverdue: false,
          startDate: minutesFromNowIso(30),
        }),
      ],
      now: NOW,
    });

    expect(model.slices['overdue-pickups'].count).toBe(0);
    expect(model.slices['overdue-pickups'].tone).toBe('success');
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

  it('keeps the canonical runtime slice ids and uses blocked-maintenance (not maintenance)', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'v1' })],
      now: NOW,
    });

    expect(Object.keys(model.slices).sort()).toEqual(
      [
        'active-rented',
        'blocked-maintenance',
        'critical-alerts',
        'due-soon',
        'overdue-pickups',
        'overdue-returns',
        'ready-to-rent',
      ].sort(),
    );
    expect(model.slices).not.toHaveProperty('maintenance');
    expect(model.slices['blocked-maintenance'].id).toBe('blocked-maintenance');
  });

  it('treats an available but not-clean vehicle as not-ready without blocking it', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'ready', license: 'READY' }),
        vehicle({ id: 'dirty', license: 'DIRTY', cleaningStatus: 'Needs Cleaning' }),
      ],
      now: NOW,
    });

    const dirty = model.vehicleStates.find((state) => state.vehicleId === 'dirty');
    const ready = model.slices['ready-to-rent'];
    const blocked = model.slices['blocked-maintenance'];
    const notReadyGroup = ready.groups?.find((group) => group.id === 'available-but-not-ready');

    // Not ready, but not a blocker → stays out of Blocked & Maintenance.
    expect(dirty?.isReadyToRent).toBe(false);
    expect(dirty?.isBlocked).toBe(false);
    expect(dirty?.blockReasons.some((reason) => reason.blocking === true)).toBe(false);
    expect(dirty?.warningReasons.some((reason) => reason.category === 'cleaning')).toBe(true);
    expect(ready.rows.map((row) => row.vehicleId)).not.toContain('dirty');
    expect(notReadyGroup?.rows.map((row) => row.vehicleId)).toContain('dirty');
    expect(blocked.rows.map((row) => row.vehicleId)).not.toContain('dirty');
  });

  it('does not count warnings, cleaning, soft-offline or standby into blocked-maintenance', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'maintenance', status: 'Maintenance' }),
        vehicle({ id: 'dirty', cleaningStatus: 'Needs Cleaning' }),
        vehicle({ id: 'soft', lastSignal: hoursAgoIso(25), onlineStatus: 'OFFLINE', isFresh: false }),
        vehicle({ id: 'standby', lastSignal: hoursAgoIso(3), onlineStatus: 'STANDBY', isFresh: false }),
        vehicle({ id: 'warning-only' }),
      ],
      insights: [
        insight({
          id: 'svc',
          type: 'SERVICE_WINDOW',
          severity: 'WARNING',
          title: 'Service soon',
          entityIds: ['warning-only'],
        }),
      ],
      now: NOW,
    });

    const blockedIds = model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId);
    expect(blockedIds).toEqual(['maintenance']);
    expect(blockedIds).not.toContain('dirty');
    expect(blockedIds).not.toContain('soft');
    expect(blockedIds).not.toContain('standby');
    expect(blockedIds).not.toContain('warning-only');
  });

  it('keeps a warning-only available vehicle ready (warning never prevents ready)', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'svc-warn', license: 'SVC' })],
      insights: [
        insight({
          id: 'svc',
          type: 'SERVICE_WINDOW',
          severity: 'WARNING',
          title: 'Service window',
          entityIds: ['svc-warn'],
        }),
      ],
      now: NOW,
    });

    const state = model.vehicleStates[0];
    // A due-soon / service-window warning stays visible but no longer prevents
    // readiness or blocks renting on its own.
    expect(state?.isWarning).toBe(true);
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.isBlocked).toBe(false);
    expect(state?.warningReasons.some((reason) => reason.preventsReady === true)).toBe(false);
    expect(state?.warningReasons.some((reason) => reason.blocking === true)).toBe(false);
    expect(model.slices['ready-to-rent'].rows.map((row) => row.vehicleId)).toContain('svc-warn');
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('svc-warn');
  });

  it('keeps an available vehicle with a tire warning ready (Task A: warning alone)', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'tire-warn',
        health({
          vehicleId: 'tire-warn',
          overall_state: 'warning',
          modules: { tires: { state: 'warning', reason: 'Reifen beobachten' } },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'tire-warn', license: 'TIRE' })],
      healthMap,
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.isWarning).toBe(true);
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.warningReasons.some((reason) => reason.category === 'tires')).toBe(true);
    expect(state?.warningReasons.some((reason) => reason.preventsReady === true)).toBe(false);
    expect(model.slices['ready-to-rent'].rows.map((row) => row.vehicleId)).toContain('tire-warn');
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('tire-warn');
  });

  it('keeps an available vehicle with a non-blocking DTC warning ready (Task F)', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'dtc-warn',
        health({
          vehicleId: 'dtc-warn',
          overall_state: 'warning',
          modules: { error_codes: { state: 'warning', reason: '1 aktive Fehlercodes' } },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'dtc-warn', license: 'DTC' })],
      healthMap,
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.isWarning).toBe(true);
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.warningReasons.some((reason) => reason.category === 'dtc')).toBe(true);
    expect(state?.warningReasons.some((reason) => reason.preventsReady === true)).toBe(false);
    expect(model.slices['ready-to-rent'].rows.map((row) => row.vehicleId)).toContain('dtc-warn');
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('dtc-warn');
  });

  it('keeps generic critical health visible without blocking when no explicit rental blocker exists', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'battery-critical-open',
        health({
          vehicleId: 'battery-critical-open',
          overall_state: 'critical',
          rental_blocked: false,
          blocking_reasons: [],
          modules: { battery: { state: 'critical', reason: 'Batterie kritisch' } },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'battery-critical-open', license: 'BAT-OPEN' })],
      healthMap,
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.isCritical).toBe(true);
    expect(state?.criticalReasons.some((reason) => reason.category === 'battery')).toBe(true);
    expect(state?.blockReasons.some((reason) => reason.category === 'battery')).toBe(false);
    expect(state?.isBlocked).toBe(false);
    expect(state?.isReadyToRent).toBe(true);
    expect(model.slices['blocked-maintenance'].rows.map((row) => row.vehicleId)).not.toContain('battery-critical-open');
    expect(model.slices['critical-alerts'].rows.map((row) => row.vehicleId)).toContain('battery-critical-open');
  });

  it('does not emit dashboard-health-risk when a concrete rental-health reason exists (Task C)', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'both',
        health({
          vehicleId: 'both',
          overall_state: 'warning',
          modules: { tires: { state: 'warning', reason: 'Reifen beobachten' } },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'both', license: 'BOTH' })],
      healthMap,
      healthRiskVehicleIds: new Set(['both']),
      now: NOW,
    });

    const state = model.vehicleStates[0];
    const allReasons = [
      ...(state?.warningReasons ?? []),
      ...(state?.criticalReasons ?? []),
      ...(state?.notReadyReasons ?? []),
    ];
    expect(state?.warningReasons.some((reason) => reason.source === 'rental-health:tires')).toBe(true);
    expect(allReasons.some((reason) => reason.source === 'dashboard-health-risk')).toBe(false);
    // No duplicate generic pill, and the concrete warning alone keeps it ready.
    expect(state?.isReadyToRent).toBe(true);
  });

  it('emits dashboard-health-risk only as a non-blocking fallback (Task C fallback)', () => {
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'risk-only', license: 'RISK' })],
      healthRiskVehicleIds: new Set(['risk-only']),
      now: NOW,
    });

    const state = model.vehicleStates[0];
    const fallback = state?.warningReasons.find((reason) => reason.source === 'dashboard-health-risk');
    expect(fallback).toBeDefined();
    expect(fallback?.preventsReady ?? false).toBe(false);
    expect(fallback?.blocking ?? false).toBe(false);
    expect(state?.isReadyToRent).toBe(true);
    expect(state?.isBlocked).toBe(false);
  });

  it('treats overdue compliance as blocking under blocked-by-compliance (Task D)', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-overdue',
        health({
          vehicleId: 'svc-overdue',
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['TÜV abgelaufen'],
          modules: { service_compliance: { state: 'critical', reason: 'Service overdue 117 days' } },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'svc-overdue', license: 'SVC-OD' })],
      healthMap,
      now: NOW,
    });

    const state = model.vehicleStates[0];
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
    expect(
      state?.blockReasons.some(
        (reason) =>
          reason.blocking === true && reason.category === 'compliance' && reason.title.includes('TÜV'),
      ),
    ).toBe(true);

    const blocked = model.slices['blocked-maintenance'];
    expect(blocked.rows.map((row) => row.vehicleId)).toContain('svc-overdue');
    const complianceGroup = blocked.groups?.find((groupItem) => groupItem.id === 'blocked-by-compliance');
    expect(complianceGroup?.rows.map((row) => row.vehicleId)).toContain('svc-overdue');
  });

  it('blocks ready for TÜV overdue compliance blocker', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'tuv-overdue',
        health({
          vehicleId: 'tuv-overdue',
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['TÜV abgelaufen seit 3 Tagen'],
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'tuv-overdue', license: 'TUV-OD' })],
      healthMap,
      now: NOW,
    });
    const state = model.vehicleStates[0];
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
    expect(
      state?.blockReasons.some(
        (reason) => reason.category === 'compliance' && reason.blocking === true,
      ),
    ).toBe(true);
    expect(model.slices['critical-alerts'].rows.map((row) => row.vehicleId)).toContain('tuv-overdue');
  });

  it('blocks ready for BOKraft overdue compliance blocker', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'bokraft-overdue',
        health({
          vehicleId: 'bokraft-overdue',
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['BOKraft abgelaufen seit 1 Tag'],
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [vehicle({ id: 'bokraft-overdue', license: 'BOK-OD' })],
      healthMap,
      now: NOW,
    });
    const state = model.vehicleStates[0];
    expect(state?.isReadyToRent).toBe(false);
    expect(state?.isBlocked).toBe(true);
    expect(
      state?.blockReasons.some(
        (reason) => reason.category === 'compliance' && reason.title.includes('BOKraft'),
      ),
    ).toBe(true);
  });

  it('places service overdue in service-critical group, not compliance-critical', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-only',
        health({
          vehicleId: 'svc-only',
          overall_state: 'critical',
          rental_blocked: false,
          blocking_reasons: [],
          modules: {
            service_compliance: {
              state: 'critical',
              reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
            },
          },
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'de',
      fleetVehicles: [vehicle({ id: 'svc-only', license: 'SVC' })],
      healthMap,
      now: NOW,
    });
    const slice = model.slices['critical-alerts'];
    const serviceGroup = slice.groups?.find((group) => group.id === 'service-critical');
    const complianceGroup = slice.groups?.find((group) => group.id === 'compliance-critical');
    expect(serviceGroup?.rows.map((row) => row.vehicleId)).toContain('svc-only');
    expect(complianceGroup?.rows.map((row) => row.vehicleId) ?? []).not.toContain('svc-only');
  });

  it('keeps critical drawer header count aligned with visible rows and group sums', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'svc-only',
        health({
          vehicleId: 'svc-only',
          overall_state: 'critical',
          modules: {
            service_compliance: { state: 'critical', reason: 'Service überfällig' },
          },
        }),
      ],
      [
        'tuv-overdue',
        health({
          vehicleId: 'tuv-overdue',
          rental_blocked: true,
          blocking_reasons: ['TÜV abgelaufen'],
        }),
      ],
    ]);
    const model = buildDashboardRuntimeModel({
      locale: 'en',
      fleetVehicles: [
        vehicle({ id: 'svc-only', license: 'SVC' }),
        vehicle({ id: 'tuv-overdue', license: 'TUV' }),
      ],
      healthMap,
      insights: [
        insight({
          id: 'svc-insight',
          type: 'SERVICE_OVERDUE',
          severity: 'CRITICAL',
          title: 'Service überfällig',
          entityIds: ['svc-only'],
        }),
      ],
      now: NOW,
    });
    const slice = model.slices['critical-alerts'];
    expect(slice.count).toBe(slice.rows.length);
    const groupSum = (slice.groups ?? []).reduce((sum, group) => sum + group.count, 0);
    expect(groupSum).toBe(slice.count);
    expect(slice.count).toBe(2);
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
