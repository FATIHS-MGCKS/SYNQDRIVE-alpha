import type { VehicleHealthResponse } from '../../../../lib/api';
import type {
  DashboardInsight,
  InsightSeverity,
} from '../../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import { selectFleetRuntimeOperationalStatus } from '../../../lib/fleet-map-vehicle-selectors';
import {
  categoryFromHealthModule,
  categoryFromInsightType,
  createRuntimeReason,
  dedupeRuntimeReasons,
  isComplianceCategory,
  isLegalComplianceBlockingText,
} from './dashboardRuntimeReasons';
import type {
  BookingRuntimeState,
  ComplianceSeverity,
  DataQualityState,
  HealthSeverity,
  RentalBlockLevel,
  RuntimeReason,
  RuntimeReasonCategory,
  RuntimeReasonSeverity,
  TelemetryConnectionState,
  VehicleOperationalStatus,
  VehicleRuntimeState,
} from './dashboardRuntimeTypes';

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const TELEMETRY_LIVE_MAX_MS = 15 * MS_MINUTE;
const DEFAULT_DUE_SOON_MINUTES = 60;
const DEFAULT_SOFT_OFFLINE_HOURS = 24;
const DEFAULT_HARD_OFFLINE_HOURS = 48;

interface VehicleTelemetryTimestampFields {
  lastSignal?: string | null;
  lastSeen?: string | null;
  lastSeenAt?: string | null;
  lastSnapshotAt?: string | null;
  telemetryUpdatedAt?: string | null;
  latestTelemetryAt?: string | null;
  signalAgeMs?: number | null;
  isLiveTracking?: boolean;
  isFresh?: boolean;
  online?: boolean;
  onlineStatus?: string | null;
  displayState?: string | null;
  displayIgnition?: string | null;
  speed?: number | null;
}

function mapOperationalStatus(vehicle: VehicleData): VehicleOperationalStatus {
  return selectFleetRuntimeOperationalStatus(vehicle);
}

export interface BuildVehicleRuntimeStatesInput {
  fleetVehicles: VehicleData[];
  availableVehicles?: VehicleData[];
  activeRentedVehicles?: VehicleData[];
  reservedVehicles?: VehicleData[];
  pickupItems?: PickupTileItem[];
  returnItems?: ReturnTileItem[];
  insights?: DashboardInsight[];
  blockedVehicleIds?: Set<string>;
  healthRiskVehicleIds?: Set<string>;
  healthMap?: Map<string, VehicleHealthResponse>;
  now?: Date;
  locale?: string;
  dueSoonMinutes?: number;
  telemetrySoftOfflineHours?: number;
  telemetryHardOfflineHours?: number;
  telemetryOfflineBlockLevel?: Exclude<RentalBlockLevel, 'none'> | 'none';
}

function parseTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function latestTelemetryTimestampMs(vehicle: VehicleTelemetryTimestampFields): number | null {
  const candidates = [
    vehicle.lastSignal,
    vehicle.lastSeen,
    vehicle.lastSeenAt,
    vehicle.lastSnapshotAt,
    vehicle.telemetryUpdatedAt,
    vehicle.latestTelemetryAt,
  ]
    .map(parseTimeMs)
    .filter((ms): ms is number => ms != null);

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function deriveSignalAgeMs(vehicle: VehicleTelemetryTimestampFields, nowMs: number): number | null {
  const timestampMs = latestTelemetryTimestampMs(vehicle);
  if (timestampMs != null) return Math.max(0, nowMs - timestampMs);

  if (
    typeof vehicle.signalAgeMs === 'number' &&
    Number.isFinite(vehicle.signalAgeMs) &&
    vehicle.signalAgeMs < Number.MAX_SAFE_INTEGER
  ) {
    return Math.max(0, vehicle.signalAgeMs);
  }

  return null;
}

function hasFreshLiveHint(vehicle: VehicleTelemetryTimestampFields, ageMs: number): boolean {
  if (ageMs >= TELEMETRY_LIVE_MAX_MS) return false;
  if (vehicle.isLiveTracking === true) return true;
  if (vehicle.isFresh === true) return true;
  if (vehicle.online === true || vehicle.onlineStatus === 'ONLINE') return true;
  if (vehicle.displayState === 'MOVING') return true;
  if (vehicle.displayIgnition === 'ON') return true;
  return typeof vehicle.speed === 'number' && vehicle.speed > 0;
}

export function deriveTelemetryState(
  vehicle: VehicleData,
  now: Date,
  softOfflineHours: number = DEFAULT_SOFT_OFFLINE_HOURS,
  hardOfflineHours: number = DEFAULT_HARD_OFFLINE_HOURS,
): TelemetryConnectionState {
  const nowMs = now.getTime();
  const ageMs = deriveSignalAgeMs(vehicle as VehicleTelemetryTimestampFields, nowMs);
  if (ageMs == null) return 'unknown';

  if (ageMs < TELEMETRY_LIVE_MAX_MS || hasFreshLiveHint(vehicle, ageMs)) return 'live';

  const softMs = Math.max(0, softOfflineHours) * MS_HOUR;
  const hardMs = Math.max(softMs, hardOfflineHours * MS_HOUR);
  if (ageMs < softMs) return 'standby';
  if (ageMs < hardMs) return 'soft_offline';
  return 'offline';
}

function vehicleDisplayName(vehicle: VehicleData): string {
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  if (vehicle.license && makeModel) return `${vehicle.license} · ${makeModel}`;
  return vehicle.license || makeModel || vehicle.id;
}

function matchesVehicle(item: Pick<PickupTileItem | ReturnTileItem, 'vehicleId' | 'plate'>, vehicle: VehicleData): boolean {
  if (item.vehicleId && item.vehicleId === vehicle.id) return true;
  return !!item.plate && !!vehicle.license && item.plate === vehicle.license;
}

function isDueSoon(iso: string | undefined, nowMs: number, dueSoonMinutes: number): boolean {
  const ms = parseTimeMs(iso);
  if (ms == null) return false;
  const diff = ms - nowMs;
  return diff >= 0 && diff <= dueSoonMinutes * MS_MINUTE;
}

function deriveBookingState(input: {
  vehicle: VehicleData;
  operationalStatus: VehicleOperationalStatus;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  nowMs: number;
  dueSoonMinutes: number;
}): BookingRuntimeState {
  const vehicleReturns = input.returnItems.filter((item) => matchesVehicle(item, input.vehicle));
  if (vehicleReturns.some((item) => item.isOverdue === true && !item.done)) return 'return_overdue';
  if (vehicleReturns.some((item) => !item.done && isDueSoon(item.endDate, input.nowMs, input.dueSoonMinutes))) {
    return 'return_due_soon';
  }

  const vehiclePickups = input.pickupItems.filter((item) => matchesVehicle(item, input.vehicle));
  if (vehiclePickups.some((item) => !item.done && isDueSoon(item.startDate, input.nowMs, input.dueSoonMinutes))) {
    return 'pickup_due_soon';
  }

  if (input.operationalStatus === 'active_rented') return 'active_rented';
  if (input.operationalStatus === 'reserved') return 'reserved';
  if (input.operationalStatus === 'unknown') return 'unknown';
  return 'none';
}

function insightMatchesVehicle(insight: DashboardInsight, vehicleId: string): boolean {
  if (insight.entityIds?.includes(vehicleId) === true) return true;

  const metrics = insight.metrics;
  if (!metrics || typeof metrics !== 'object') return false;

  const metricVehicleId = metrics.vehicleId;
  if (metricVehicleId === vehicleId) return true;

  const metricVehicleIds = metrics.vehicleIds;
  if (Array.isArray(metricVehicleIds) && metricVehicleIds.includes(vehicleId)) return true;

  const entities = metrics.entities;
  if (!Array.isArray(entities)) return false;

  return entities.some((entity) => {
    if (!entity || typeof entity !== 'object') return false;
    const record = entity as Record<string, unknown>;
    return record.id === vehicleId || record.vehicleId === vehicleId;
  });
}

function severityFromInsight(severity: InsightSeverity): RuntimeReasonSeverity | null {
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'WARNING') return 'warning';
  if (severity === 'INFO' || severity === 'OPPORTUNITY') return 'info';
  return null;
}

function isHardBlockingCategory(category: RuntimeReasonCategory): boolean {
  return (
    category === 'operational' ||
    category === 'rental' ||
    category === 'telemetry' ||
    category === 'compliance' ||
    category === 'health' ||
    category === 'tires' ||
    category === 'brakes' ||
    category === 'battery' ||
    category === 'dtc' ||
    category === 'damage'
  );
}

function isHealthCategory(category: RuntimeReasonCategory): boolean {
  return (
    category === 'health' ||
    category === 'tires' ||
    category === 'brakes' ||
    category === 'battery' ||
    category === 'dtc'
  );
}

function categoryFromBlockingReason(reason: string): RuntimeReasonCategory {
  const normalized = reason.toLowerCase();
  if (isLegalComplianceBlockingText(reason)) {
    return 'compliance';
  }
  if (
    normalized.includes('service') ||
    normalized.includes('wartung') ||
    normalized.includes('hm/oem') ||
    normalized.includes('oem')
  ) {
    return 'service';
  }
  if (normalized.includes('reifen') || normalized.includes('tire')) {
    return 'tires';
  }
  if (normalized.includes('brems') || normalized.includes('brake')) {
    return 'brakes';
  }
  if (
    normalized.includes('dtc') ||
    normalized.includes('fehlercode') ||
    normalized.includes('fehlercodes')
  ) {
    return 'dtc';
  }
  if (normalized.includes('battery') || normalized.includes('batterie')) {
    return 'battery';
  }
  if (normalized.includes('öl') || normalized.includes('oil')) {
    return 'health';
  }
  if (normalized.includes('damage') || normalized.includes('schaden')) return 'damage';
  if (normalized.includes('health')) return 'health';
  return 'rental';
}

/**
 * A reason counts as a true blocker (Blocked & Maintenance candidate) only when
 * it is explicitly marked `blocking`. Warnings, cleaning, soft-offline and a
 * reason's category must never imply blocking on their own.
 */
function reasonBlocksRenting(reason: RuntimeReason): boolean {
  return reason.blocking === true;
}

/**
 * A reason prevents Ready-to-Rent when it is explicitly marked `preventsReady`
 * or when it is a hard `blocking` reason. The decision is never derived from the
 * reason category — warnings alone (health, tires, brakes, battery, dtc,
 * service due-soon, …) stay visible but must not prevent readiness on their own.
 * Only the reason producer sets `preventsReady` (e.g. cleaning, hard offline).
 */
function reasonPreventsReady(reason: RuntimeReason): boolean {
  if (reason.preventsReady === true) return true;
  if (reason.blocking === true) return true;
  return false;
}

function addReason(target: RuntimeReason[], reason: RuntimeReason): void {
  target.push(reason);
}

function addInsightReasons(input: {
  target: RuntimeReason[];
  vehicle: VehicleData;
  insights: DashboardInsight[];
}): void {
  for (const insight of input.insights) {
    if (!insightMatchesVehicle(insight, input.vehicle.id)) continue;

    const severity = severityFromInsight(insight.severity);
    if (!severity || severity === 'info') continue;

    const category = categoryFromInsightType(insight.type);
    // Insights stay visible as operational signals, but their severity/category
    // never implies a rental block. Blocking must come from explicit canonical
    // sources (rental_blocked/blocking_reasons, operational status, offline policy).
    addReason(
      input.target,
      createRuntimeReason({
        category,
        severity,
        title: insight.title,
        description: insight.message,
        source: `dashboard-insight:${insight.type}`,
        blocking: false,
        preventsReady: false,
        actionLabel: insight.actionLabel ?? undefined,
        actionTarget: insight.actionType ?? undefined,
      }),
    );
  }
}

function addHealthReasons(input: {
  target: RuntimeReason[];
  health: VehicleHealthResponse | null;
  healthRisk: boolean;
}): void {
  // Tracks whether any concrete rental-health:* reason was produced for this
  // vehicle. The generic dashboard-health-risk reason is only a fallback and
  // must never be emitted alongside concrete module/rental reasons.
  let concreteHealthReasonAdded = false;

  if (input.health?.rental_blocked === true) {
    for (const reason of input.health.blocking_reasons) {
      const category = categoryFromBlockingReason(reason);
      // Service/HM/OEM overdue is never a rental blocker — backend should not
      // emit it in blocking_reasons, but guard here to keep Ready truthful.
      const blocking = category !== 'service';
      addReason(
        input.target,
        createRuntimeReason({
          category,
          severity: 'critical',
          title: reason || 'Rental blocked',
          source: 'rental-health:blocking-reason',
          blocking,
          preventsReady: blocking,
        }),
      );
      concreteHealthReasonAdded = true;
    }

    if (input.health.blocking_reasons.length === 0) {
      addReason(
        input.target,
        createRuntimeReason({
          category: 'rental',
          severity: 'critical',
          title: 'Rental blocked',
          source: 'rental-health:rental-blocked',
          blocking: true,
        }),
      );
      concreteHealthReasonAdded = true;
    }
  }

  if (input.health) {
    for (const [module, moduleState] of Object.entries(input.health.modules)) {
      if (moduleState.state !== 'critical' && moduleState.state !== 'warning') continue;
      const category = categoryFromHealthModule(module);
      const severity: RuntimeReasonSeverity = moduleState.state === 'critical' ? 'critical' : 'warning';
      // Module severity is user-facing signal strength only. It never implies a
      // rental block by itself; only explicit canonical blocking reasons do.
      addReason(
        input.target,
        createRuntimeReason({
          category,
          severity,
          title: moduleState.reason || `${module.replace(/_/g, ' ')} ${moduleState.state}`,
          source: `rental-health:${module}`,
          blocking: false,
          preventsReady: false,
        }),
      );
      concreteHealthReasonAdded = true;
    }
  }

  // Fallback only: when the vehicle is flagged as a health risk but no concrete
  // rental-health:* reason explains it, surface a soft, non-blocking hint that
  // does not prevent readiness and is never stronger than a module reason.
  if (input.healthRisk && !concreteHealthReasonAdded) {
    addReason(
      input.target,
      createRuntimeReason({
        category: 'health',
        severity: 'warning',
          title: 'Health prüfen',
        source: 'dashboard-health-risk',
        blocking: false,
        preventsReady: false,
      }),
    );
  }
}

function addTelemetryReason(input: {
  target: RuntimeReason[];
  telemetryState: TelemetryConnectionState;
  locale: string;
  offlineBlockLevel: BuildVehicleRuntimeStatesInput['telemetryOfflineBlockLevel'];
}): void {
  const de = input.locale === 'de';
  if (input.telemetryState === 'soft_offline') {
    addReason(
      input.target,
      createRuntimeReason({
        category: 'telemetry',
        severity: 'warning',
        title: de ? 'Signal verzögert' : 'Signal delayed',
        description: de
          ? 'Der letzte Telemetrie-Snapshot liegt mehr als 24 Stunden zurück.'
          : 'The latest telemetry snapshot is older than 24 hours.',
        source: 'telemetry',
        blocking: false,
        preventsReady: false,
      }),
    );
  }

  if (input.telemetryState === 'offline') {
    const blocks = input.offlineBlockLevel !== 'none';
    addReason(
      input.target,
      createRuntimeReason({
        category: 'telemetry',
        severity: 'critical',
        title: 'Offline',
        description: de
          ? 'Der letzte Telemetrie-Snapshot liegt mindestens 48 Stunden zurück.'
          : 'The latest telemetry snapshot is at least 48 hours old.',
        source: 'telemetry',
        blocking: blocks,
        preventsReady: true,
      }),
    );
  }
}

function addBookingReasons(input: {
  target: RuntimeReason[];
  bookingState: BookingRuntimeState;
  locale: string;
}): void {
  const de = input.locale === 'de';
  if (input.bookingState === 'return_overdue') {
    addReason(
      input.target,
      createRuntimeReason({
        category: 'handover',
        severity: 'critical',
        title: de ? 'Rückgabe überfällig' : 'Return overdue',
        source: 'booking-runtime:return-overdue',
        blocking: false,
      }),
    );
  } else if (input.bookingState === 'return_due_soon') {
    addReason(
      input.target,
      createRuntimeReason({
        category: 'handover',
        severity: 'warning',
        title: de ? 'Rückgabe bald fällig' : 'Return due soon',
        source: 'booking-runtime:return-due-soon',
        blocking: false,
      }),
    );
  } else if (input.bookingState === 'pickup_due_soon') {
    addReason(
      input.target,
      createRuntimeReason({
        category: 'handover',
        severity: 'warning',
        title: de ? 'Übergabe bald fällig' : 'Pickup due soon',
        source: 'booking-runtime:pickup-due-soon',
        blocking: false,
      }),
    );
  }
}

function deriveHealthSeverity(reasons: RuntimeReason[], health: VehicleHealthResponse | null): HealthSeverity {
  const healthReasons = reasons.filter((reason) => isHealthCategory(reason.category));
  if (healthReasons.some((reason) => reason.severity === 'critical')) return 'critical';
  if (healthReasons.some((reason) => reason.severity === 'warning')) return 'warning';
  if (health) {
    if (health.overall_state === 'critical') return 'critical';
    if (health.overall_state === 'warning') return 'warning';
    if (health.overall_state === 'good' || health.overall_state === 'n_a') return 'ok';
  }
  return 'unknown';
}

function deriveComplianceSeverity(reasons: RuntimeReason[]): ComplianceSeverity {
  const complianceReasons = reasons.filter((reason) => isComplianceCategory(reason.category));
  if (complianceReasons.some((reason) => reason.severity === 'critical')) return 'critical';
  if (complianceReasons.some((reason) => reason.severity === 'warning')) return 'warning';
  return complianceReasons.length > 0 ? 'ok' : 'unknown';
}

function deriveDataQualityState(telemetryState: TelemetryConnectionState): DataQualityState {
  if (telemetryState === 'live' || telemetryState === 'standby') return 'fresh';
  if (telemetryState === 'soft_offline') return 'limited';
  if (telemetryState === 'offline') return 'outdated';
  return 'missing';
}

function buildReadyReasons(locale: string): RuntimeReason[] {
  return [
    createRuntimeReason({
      category: 'rental',
      severity: 'info',
      title: locale === 'de' ? 'Bereit' : 'Ready',
      source: 'vehicle-runtime',
      blocking: false,
    }),
  ];
}

function buildRuntimeState(input: {
  vehicle: VehicleData;
  allReasons: RuntimeReason[];
  operationalStatus: VehicleOperationalStatus;
  telemetryState: TelemetryConnectionState;
  bookingState: BookingRuntimeState;
  health: VehicleHealthResponse | null;
  hardBlockReasonIds: Set<string>;
  locale: string;
}): VehicleRuntimeState {
  const reasons = dedupeRuntimeReasons(input.allReasons);
  const criticalReasons = reasons.filter((reason) => reason.severity === 'critical');
  const warningReasons = reasons.filter((reason) => reason.severity === 'warning');
  const blockReasons = reasons.filter(reasonBlocksRenting);
  const readinessBlockingReasons = reasons.filter(reasonPreventsReady);

  const hasHardBlock = blockReasons.some((reason) => input.hardBlockReasonIds.has(reason.id));
  const blockLevel: RentalBlockLevel = hasHardBlock
    ? 'hard_blocked'
    : blockReasons.length > 0
      ? 'soft_blocked'
      : 'none';

  const isReadyToRent =
    input.operationalStatus === 'available' &&
    input.vehicle.cleaningStatus === 'Clean' &&
    blockLevel === 'none' &&
    readinessBlockingReasons.length === 0;

  const rentalReadiness = isReadyToRent ? 'ready' : blockLevel !== 'none' ? 'blocked' : 'not_ready';

  return {
    vehicleId: input.vehicle.id,
    license: input.vehicle.license || undefined,
    displayName: vehicleDisplayName(input.vehicle),
    stationId: input.vehicle.stationId ?? input.vehicle.homeStationId ?? input.vehicle.currentStationId ?? null,
    stationLabel: input.vehicle.station || null,
    operationalStatus: input.operationalStatus,
    rentalReadiness,
    blockLevel,
    healthSeverity: deriveHealthSeverity(reasons, input.health),
    complianceSeverity: deriveComplianceSeverity(reasons),
    telemetryState: input.telemetryState,
    dataQualityState: deriveDataQualityState(input.telemetryState),
    bookingState: input.bookingState,
    readyReasons: isReadyToRent ? buildReadyReasons(input.locale) : [],
    notReadyReasons: isReadyToRent ? [] : reasons.filter((reason) => reason.severity !== 'info' || reason.blocking),
    blockReasons,
    warningReasons,
    criticalReasons,
    isAvailable: input.operationalStatus === 'available',
    isReadyToRent,
    isBlocked: rentalReadiness === 'blocked' || blockLevel !== 'none',
    isMaintenance: input.operationalStatus === 'maintenance',
    isCritical: criticalReasons.length > 0 || blockLevel === 'hard_blocked',
    isWarning: criticalReasons.length === 0 && blockLevel !== 'hard_blocked' && warningReasons.length > 0,
  };
}

export function buildVehicleRuntimeStates(input: BuildVehicleRuntimeStatesInput): VehicleRuntimeState[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const locale = input.locale ?? 'en';
  const dueSoonMinutes = input.dueSoonMinutes ?? DEFAULT_DUE_SOON_MINUTES;
  const pickupItems = input.pickupItems ?? [];
  const returnItems = input.returnItems ?? [];
  const insights = input.insights ?? [];
  const blockedVehicleIds = input.blockedVehicleIds ?? new Set<string>();
  const healthRiskVehicleIds = input.healthRiskVehicleIds ?? new Set<string>();
  const telemetryOfflineBlockLevel = input.telemetryOfflineBlockLevel ?? 'hard_blocked';

  return input.fleetVehicles.map((vehicle) => {
    const operationalStatus = mapOperationalStatus(vehicle);
    const telemetryState = deriveTelemetryState(
      vehicle,
      now,
      input.telemetrySoftOfflineHours ?? DEFAULT_SOFT_OFFLINE_HOURS,
      input.telemetryHardOfflineHours ?? DEFAULT_HARD_OFFLINE_HOURS,
    );
    const bookingState = deriveBookingState({
      vehicle,
      operationalStatus,
      pickupItems,
      returnItems,
      nowMs,
      dueSoonMinutes,
    });
    const health = input.healthMap?.get(vehicle.id) ?? null;
    const reasons: RuntimeReason[] = [];
    const hardBlockReasonIds = new Set<string>();

    const registerHardReason = (reason: RuntimeReason): void => {
      addReason(reasons, reason);
      hardBlockReasonIds.add(reason.id);
    };

    if (operationalStatus === 'maintenance') {
      registerHardReason(
        createRuntimeReason({
          category: 'operational',
          severity: 'critical',
          title: vehicle.maintenanceReason || 'Maintenance',
          source: 'vehicle-status:maintenance',
          blocking: true,
        }),
      );
    }

    if (operationalStatus === 'unavailable') {
      registerHardReason(
        createRuntimeReason({
          category: 'operational',
          severity: 'critical',
          title: 'Unavailable',
          source: 'vehicle-status:unavailable',
          blocking: true,
        }),
      );
    }

    if (blockedVehicleIds.has(vehicle.id)) {
      registerHardReason(
        createRuntimeReason({
          category: 'rental',
          severity: 'critical',
          title: 'Rental blocked',
          source: 'blocked-vehicle-ids',
          blocking: true,
        }),
      );
    }

    if (vehicle.cleaningStatus !== 'Clean') {
      // Cleaning keeps a vehicle out of Ready-to-Rent but is not a hard blocker:
      // it must not move an otherwise available vehicle into Blocked & Maintenance.
      addReason(
        reasons,
        createRuntimeReason({
          category: 'cleaning',
          severity: 'warning',
          title: locale === 'de' ? 'Reinigung erforderlich' : 'Cleaning required',
          source: 'vehicle-cleaning-status',
          blocking: false,
          preventsReady: true,
        }),
      );
    }

    addHealthReasons({
      target: reasons,
      health,
      healthRisk: healthRiskVehicleIds.has(vehicle.id),
    });
    addInsightReasons({ target: reasons, vehicle, insights });
    addTelemetryReason({
      target: reasons,
      telemetryState,
      locale,
      offlineBlockLevel: telemetryOfflineBlockLevel,
    });
    addBookingReasons({ target: reasons, bookingState, locale });

    for (const reason of reasons) {
      if (
        reason.blocking === true &&
        reason.severity === 'critical' &&
        (isHardBlockingCategory(reason.category) ||
          (reason.category === 'telemetry' && telemetryOfflineBlockLevel === 'hard_blocked'))
      ) {
        hardBlockReasonIds.add(reason.id);
      }
    }

    return buildRuntimeState({
      vehicle,
      allReasons: reasons,
      operationalStatus,
      telemetryState,
      bookingState,
      health,
      hardBlockReasonIds,
      locale,
    });
  });
}
