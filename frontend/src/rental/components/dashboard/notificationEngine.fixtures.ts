/**
 * Shared deterministic fixtures for notification-engine characterization tests.
 * Fixed timestamps — never use real Date.now() in tests importing this module.
 */
import type { DashboardInsight, VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { DashboardNotificationItem } from './dashboardNotificationTypes';
import type { BuildActionQueueInput } from './actionQueueBuilder';
import type { DashboardRuntimeModel, RuntimeReason, VehicleRuntimeState } from './runtime';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import { VEHICLE_OPERATIONAL_STATUS } from '../../lib/vehicle-operational-state';

/** Fixed reference instant for all notification-engine tests (2026-07-10 12:00 UTC). */
export const NOTIFICATION_TEST_NOW_ISO = '2026-07-10T12:00:00.000Z';
export const NOTIFICATION_TEST_NOW_MS = Date.parse(NOTIFICATION_TEST_NOW_ISO);
export const NOTIFICATION_TEST_INSIGHTS_GENERATED_AT = '2026-07-10T11:32:00.000Z';

// ─── WOB L 7503 ───────────────────────────────────────────────────────────

export const WOB_VEHICLE_ID = 'veh-wob-l-7503';
export const WOB_ORG_ID = 'org-test-wob';
export const WOB_PLATE = 'WOB L 7503';
export const WOB_MAKE = 'Volkswagen';
export const WOB_MODEL = 'Tiguan';
export const WOB_YEAR = 2026;

export function wobVehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? WOB_VEHICLE_ID,
    license: overrides.license ?? WOB_PLATE,
    make: overrides.make ?? WOB_MAKE,
    model: overrides.model ?? WOB_MODEL,
    year: overrides.year ?? WOB_YEAR,
    station: overrides.station ?? 'Wolfsburg Zentrale',
    stationId: overrides.stationId ?? 'st-wob',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Warning',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOTIFICATION_TEST_NOW_ISO,
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 12_400,
    fuel: overrides.fuel ?? 65,
    battery: overrides.battery ?? 88,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 85,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    leasingRate: overrides.leasingRate ?? '0',
    insuranceCost: overrides.insuranceCost ?? '0',
    taxCost: overrides.taxCost ?? '0',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '0',
  };
}

export function drivingAssessmentInsight(
  status: 'DEGRADED' | 'RECOVERING',
  overrides: Partial<DashboardInsight> = {},
): DashboardInsight {
  const recovering = status === 'RECOVERING';
  return {
    id: overrides.id ?? `insight-daq-${status.toLowerCase()}`,
    type: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    severity: recovering ? 'INFO' : 'WARNING',
    priority: recovering ? 40 : 55,
    title:
      overrides.title ??
      (recovering
        ? `Fahrbewertung normalisiert sich — ${WOB_PLATE}`
        : `Fahrbewertung eingeschränkt — ${WOB_PLATE}`),
    message:
      overrides.message ??
      (recovering
        ? 'Die native Event-Qualität verbessert sich — Fahrbewertung noch mit Vorsicht nutzen.'
        : 'Das LTE-Gerät sendet ungewöhnlich viele native Fahrereignisse.'),
    actionLabel: 'Fahrzeug öffnen',
    actionType: 'OPEN_VEHICLE',
    entityScope: 'VEHICLE',
    entityIds: [WOB_VEHICLE_ID],
    timeContext: null,
    metrics: {
      vehicleStatus: status,
      degradedSince: '2026-07-08T08:00:00.000Z',
      ...(overrides.metrics ?? {}),
    },
    reasons: overrides.reasons ?? [recovering ? 'Gerätequalität im Erholungsmodus' : 'Event-Dichte erhöht'],
    isGrouped: false,
    groupCount: 1,
    createdAt: overrides.createdAt ?? NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  };
}

export function wobComplaintsHealthAlert(
  observationDate = '2026-07-08',
): VehicleHealthAlert {
  return {
    vehicleId: WOB_VEHICLE_ID,
    vehicle: wobVehicle(),
    severity: 'warning',
    kinds: [],
    primaryReason: `Complaints: Aktive technische Beobachtung vom ${observationDate}`,
    secondaryReasons: [],
    license: WOB_PLATE,
    model: `${WOB_MAKE} ${WOB_MODEL}`,
    station: 'Wolfsburg Zentrale',
    modules: [
      {
        module: 'complaints',
        label: 'Complaints',
        severity: 'warning',
        reason: `Aktive technische Beobachtung vom ${observationDate}`,
        dataStale: false,
        lastUpdatedAt: NOTIFICATION_TEST_NOW_ISO,
      },
    ],
  };
}

export function wobComplaintsRuntimeReason(): RuntimeReason {
  return {
    id: 'wob-complaints-runtime',
    category: 'damage',
    severity: 'warning',
    title: 'Aktive technische Beobachtung vom 08.07.2026',
    source: 'rental-health:complaints',
    blocking: false,
    preventsReady: false,
  };
}

export function wobDrivingAssessmentRuntimeReason(
  status: 'DEGRADED' | 'RECOVERING',
): RuntimeReason {
  const recovering = status === 'RECOVERING';
  return {
    id: `wob-daq-${status}`,
    category: 'health',
    severity: recovering ? 'warning' : 'warning',
    title: recovering
      ? `Fahrbewertung normalisiert sich — ${WOB_PLATE}`
      : `Fahrbewertung eingeschränkt — ${WOB_PLATE}`,
    description: recovering
      ? 'Die native Event-Qualität verbessert sich'
      : 'LTE-Gerät sendet viele native Events',
    source: 'dashboard-insight:DRIVING_ASSESSMENT_DEVICE_QUALITY',
    blocking: false,
    preventsReady: false,
    actionLabel: 'Fahrzeug öffnen',
    actionTarget: 'OPEN_VEHICLE',
  };
}

export function wobGenericHealthRiskReason(): RuntimeReason {
  return {
    id: 'wob-health-risk',
    category: 'health',
    severity: 'warning',
    title: 'Health prüfen',
    source: 'dashboard-health-risk',
    blocking: false,
    preventsReady: false,
  };
}

export function wobRuntimeState(
  overrides: Partial<VehicleRuntimeState> = {},
): VehicleRuntimeState {
  return {
    vehicleId: WOB_VEHICLE_ID,
    license: WOB_PLATE,
    displayName: WOB_PLATE,
    stationId: 'st-wob',
    stationLabel: 'Wolfsburg Zentrale',
    operationalStatus: 'available',
    rentalReadiness: 'ready',
    blockLevel: 'none',
    healthSeverity: 'warning',
    complianceSeverity: 'ok',
    telemetryState: 'live',
    dataQualityState: 'fresh',
    bookingState: 'none',
    readyReasons: [],
    notReadyReasons: [],
    blockReasons: [],
    warningReasons: overrides.warningReasons ?? [],
    criticalReasons: overrides.criticalReasons ?? [],
    isAvailable: true,
    isReadyToRent: true,
    isBlocked: false,
    isMaintenance: false,
    isCritical: false,
    isWarning: true,
    ...overrides,
  };
}

export function wobRuntimeModel(
  states: VehicleRuntimeState[] = [wobRuntimeState()],
): DashboardRuntimeModel {
  return {
    generatedAt: NOTIFICATION_TEST_NOW_ISO,
    vehicleStates: states,
    slices: {} as DashboardRuntimeModel['slices'],
  };
}

export function wobHealthMapWarning(): Map<string, VehicleHealthResponse> {
  const health: VehicleHealthResponse = {
    vehicle_id: WOB_VEHICLE_ID,
    organization_id: WOB_ORG_ID,
    overall_state: 'warning',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
      tires: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
      brakes: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
      error_codes: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
      service_compliance: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
      complaints: {
        state: 'warning',
        reason: 'Aktive technische Beobachtung vom 08.07.2026',
        last_updated_at: NOTIFICATION_TEST_NOW_ISO,
        data_stale: false,
      },
      vehicle_alerts: { state: 'good', reason: 'OK', last_updated_at: NOTIFICATION_TEST_NOW_ISO, data_stale: false },
    },
    generated_at: NOTIFICATION_TEST_NOW_ISO,
  };
  return new Map([[WOB_VEHICLE_ID, health]]);
}

export function baseQueueInput(
  overrides: Partial<BuildActionQueueInput> = {},
): BuildActionQueueInput {
  const v = wobVehicle();
  return {
    locale: overrides.locale ?? 'de',
    stationFilter: null,
    fleetById: new Map([[WOB_VEHICLE_ID, v]]),
    insights: overrides.insights ?? [],
    vehicleHealthAlerts: overrides.vehicleHealthAlerts ?? [],
    pickupItems: overrides.pickupItems ?? [],
    returnItems: overrides.returnItems ?? [],
    notifications: overrides.notifications ?? [],
    derivedInsights: overrides.derivedInsights ?? [],
    predictiveInsights: overrides.predictiveInsights ?? [],
    dashboardRuntime: overrides.dashboardRuntime,
    readyToRentCount: overrides.readyToRentCount ?? 0,
    syncStatusLabel: overrides.syncStatusLabel ?? '',
  };
}

export function stationShortageInsight(stationId = 'st-wob'): DashboardInsight {
  return {
    id: 'insight-station-shortage',
    type: 'STATION_SHORTAGE',
    severity: 'WARNING',
    priority: 60,
    title: 'Station shortage',
    message: 'Not enough vehicles at station',
    actionLabel: 'Stationen öffnen',
    actionType: 'navigate_station',
    entityScope: 'STATION',
    entityIds: [stationId],
    timeContext: null,
    metrics: null,
    reasons: ['shortage'],
    isGrouped: false,
    groupCount: 1,
    createdAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  };
}

export function pickupOverdueInsight(bookingId = 'bk-pickup-1'): DashboardInsight {
  return {
    id: 'insight-pickup-overdue',
    type: 'PICKUP_OVERDUE',
    severity: 'CRITICAL',
    priority: 90,
    title: `Abholung überfällig · ${WOB_PLATE}`,
    message: 'Pickup overdue',
    actionLabel: 'Buchung öffnen',
    actionType: 'navigate_booking',
    entityScope: 'BOOKING',
    entityIds: [bookingId],
    timeContext: { dueAt: '2026-07-10T10:00:00.000Z' },
    metrics: null,
    reasons: ['overdue'],
    isGrouped: false,
    groupCount: 1,
    createdAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT,
  };
}

export type DrivingAssessmentPath =
  | 'normalized-issue'
  | 'legacy-insight'
  | 'synthetic-notification'
  | 'health-alert-complaints'
  | 'runtime-complaints'
  | 'runtime-driving-assessment'
  | 'generic-health-review';

export const DRIVING_ASSESSMENT_SEMANTIC_KEY = `vehicle:${WOB_VEHICLE_ID}:health:driving_assessment_device_quality`;
