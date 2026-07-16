import type { StatusTone } from '../../components/patterns';
import type { RentalHealthModule, VehicleHealthResponse } from '../../lib/api';
import { isLegalComplianceBlockingText } from '../components/dashboard/runtime/dashboardRuntimeReasons';
import type { VehicleData } from '../data/vehicles';
import type { VehicleHealthAlert } from '../DashboardInsightsContext';
import { deriveFleetVisualState, type FleetVisualState } from './fleetVisualState';
import {
  selectFleetActiveIsOverdue,
  selectFleetReservedIsOverdue,
} from './fleet-map-vehicle-selectors';
import {
  formatVehicleOperationalStatusLabel,
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';
import {
  formatUserFacingReasonLabel,
  isOperativeRentalHealthModule,
  sanitizeUserFacingIssueText,
} from './operational-issues';
import {
  resolveTelemetryFreshness,
  type TelemetryFreshness,
} from './telemetryFreshness';
import {
  resolveBookingSupplement,
  resolveOperationalStatusBadge,
  type BookingSupplementDisplay,
  type OperationalStatusBadgeDisplay,
} from './vehicle-operational-booking-display';
import type { VehicleOperationalDisplayLocale } from './vehicle-operational-state';

/**
 * Shared display layer for fleet vehicle rows (Dashboard Fleet State Board +
 * Fleet Page / Fleet Command). It does NOT recompute fleet truth — it wraps the
 * canonical {@link deriveFleetVisualState} and separates two concerns that were
 * previously mixed in the UI:
 *
 *   1. Operational Status — the primary rental/health state of the vehicle
 *      (available / critical / warning / active / reserved / maintenance / blocked).
 *      Telemetry freshness never changes this.
 *   2. Telemetry Freshness — a secondary signal indicator (live / standby /
 *      soft offline / offline). Soft offline is never shown as a primary status badge.
 */

export type FleetOperationalStatus =
  | 'ready'
  | 'critical'
  | 'warning'
  | 'active'
  | 'reserved'
  | 'maintenance'
  | 'blocked'
  | 'unknown';

/**
 * Telemetry status mirrors the canonical 5-state freshness. `stale` is gone as
 * a fleet status — `standby` is a normal quiet state, `signal_delayed` is soft
 * offline (24–48h), and only `offline` / `no_signal` are genuine problems.
 */
export type FleetTelemetryStatus = TelemetryFreshness;

export type FleetEnergyTone = 'green' | 'yellow' | 'red' | 'neutral';

export interface FleetEnergyDisplay {
  kind: 'fuel' | 'battery';
  percent: number | null;
  tone: FleetEnergyTone;
}

/**
 * Vehicle Health condition — strictly separate from rental availability.
 * `Available` is never a health value here; a healthy vehicle reads "Good".
 */
export type FleetHealthStatus = 'good' | 'warning' | 'critical' | 'unknown';

export interface FleetHealthDisplay {
  status: FleetHealthStatus;
  label: string;
  tone: StatusTone;
}

/** Rental availability — strictly separate from health condition. */
export type FleetRentalAvailability =
  | 'ready'
  | 'not_ready'
  | 'active'
  | 'reserved'
  | 'maintenance'
  | 'blocked';

export interface FleetRentalDisplay {
  status: FleetRentalAvailability;
  label: string;
  tone: StatusTone;
}

/** A short, concrete reason chip (never a long red sentence). */
export interface FleetReasonBadge {
  text: string;
  tone: StatusTone;
}

export interface FleetVehicleDisplayState {
  /** Canonical operational status badge — sourced from operationalState only. */
  statusBadge: OperationalStatusBadgeDisplay;
  /** Booking context supplement line (nextBooking, pickup, return). */
  bookingSupplement: BookingSupplementDisplay | null;
  primaryStatus: FleetOperationalStatus;
  primaryLabel: string;
  primaryTone: StatusTone;
  telemetryStatus: FleetTelemetryStatus;
  telemetryLabel: string;
  /** True only when telemetry is genuinely problematic (offline or outdated). */
  showTelemetryWarning: boolean;
  signalAgeMs: number | null;
  energy: FleetEnergyDisplay;
  odometerLabel: string | null;
  /** Health condition badge (Good / Warning / Critical / Unknown). */
  healthDisplay: FleetHealthDisplay;
  /** Rental availability badge (Ready / Not Ready / Active / Reserved / …). */
  rentalDisplay: FleetRentalDisplay;
  /** Concrete reason chip, or null when there is nothing meaningful to show. */
  reasonBadge: FleetReasonBadge | null;
  /**
   * @deprecated Legacy short reason. Superseded by {@link reasonBadge}. Kept for
   * backward compatibility with non-Fleet-Page consumers.
   */
  criticalHint?: string;
}

export function fleetEnergyTone(percent: number | null | undefined): FleetEnergyTone {
  if (percent == null || !Number.isFinite(percent)) return 'neutral';
  if (percent >= 60) return 'green';
  if (percent >= 30) return 'yellow';
  return 'red';
}

/** CSS color token (var) for an energy tone. */
export function fleetEnergyToneColor(tone: FleetEnergyTone): string {
  switch (tone) {
    case 'green':
      return 'var(--status-positive)';
    case 'yellow':
      return 'var(--status-watch)';
    case 'red':
      return 'var(--status-critical)';
    default:
      return 'var(--muted-foreground)';
  }
}

function canonicalEnergyPercent(v: VehicleData): number | null {
  const preferred = v.isElectric ? v.evSoc ?? v.fuelPercent : v.fuelPercent ?? v.evSoc;
  return typeof preferred === 'number' && Number.isFinite(preferred) ? preferred : null;
}

/** Best-effort signal age in ms, from interpreted `signalAgeMs` or `lastSignal`. */
export function fleetSignalAgeMs(
  v: Pick<VehicleData, 'signalAgeMs' | 'lastSignal'>,
  now: number = Date.now(),
): number | null {
  if (typeof v.signalAgeMs === 'number' && Number.isFinite(v.signalAgeMs)) {
    return Math.max(0, v.signalAgeMs);
  }
  if (v.lastSignal) {
    const t = Date.parse(v.lastSignal);
    if (Number.isFinite(t)) return Math.max(0, now - t);
  }
  return null;
}

function formatOdometer(km: number | null | undefined, de: boolean): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  return `${Math.floor(km).toLocaleString(de ? 'de-DE' : 'en-US')} km`;
}

function hasNonServiceCriticalModule(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  if (!rentalHealth?.modules) return false;
  for (const [name, mod] of Object.entries(rentalHealth.modules) as Array<
    [keyof VehicleHealthResponse['modules'], RentalHealthModule]
  >) {
    if (name === 'service_compliance') continue;
    if (mod.state === 'critical') return true;
  }
  return false;
}

function hasHardRentalBlockingReasons(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  const reasons = rentalHealth?.blocking_reasons ?? [];
  return reasons.some((reason) => {
    const normalized = reason.toLowerCase();
    if (isLegalComplianceBlockingText(reason)) return true;
    return !normalized.includes('service') && !normalized.includes('wartung');
  });
}

function isServiceOnlyOverdueCritical(
  rentalHealth: VehicleHealthResponse | null | undefined,
): boolean {
  if (!rentalHealth || rentalHealth.rental_blocked) return false;
  if (rentalHealth.modules?.service_compliance?.state !== 'critical') return false;
  return !hasNonServiceCriticalModule(rentalHealth);
}

function isHealthCritical(v: VehicleData, rentalHealth: VehicleHealthResponse | null): boolean {
  if (rentalHealth?.rental_blocked && hasHardRentalBlockingReasons(rentalHealth)) return true;
  if (hasNonServiceCriticalModule(rentalHealth)) return true;
  if (rentalHealth?.overall_state === 'critical' && !isServiceOnlyOverdueCritical(rentalHealth)) {
    return true;
  }
  return v.healthStatus === 'Critical' && !isServiceOnlyOverdueCritical(rentalHealth);
}

function isHealthWarning(v: VehicleData, rentalHealth: VehicleHealthResponse | null): boolean {
  return rentalHealth?.overall_state === 'warning' || v.healthStatus === 'Warning';
}

/**
 * Operational status is derived independently of telemetry freshness so that an
 * offline / soft-offline available vehicle still reads as "Available" (with a
 * separate signal note), never as a stale primary status.
 */
function resolveOperationalStatus(
  v: VehicleData,
  rentalHealth: VehicleHealthResponse | null,
  visual: FleetVisualState,
): FleetOperationalStatus {
  const rentalBlocked = hasHardRentalBlockingReasons(rentalHealth) || visual.isBlocked;
  const healthCritical = isHealthCritical(v, rentalHealth);
  const healthWarning = isHealthWarning(v, rentalHealth);
  const status = selectOperationalStatus(v);

  if (healthCritical) return 'critical';
  if (rentalBlocked || visual.isBlocked) return 'blocked';
  if (status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) return 'maintenance';
  if (status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) {
    return selectFleetActiveIsOverdue(v) ? 'warning' : 'active';
  }
  if (status === VEHICLE_OPERATIONAL_STATUS.RESERVED) return 'reserved';
  if (selectFleetActiveIsOverdue(v) || selectFleetReservedIsOverdue(v) || healthWarning) {
    return 'warning';
  }
  if (status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE) return 'ready';
  return 'unknown';
}

function primaryLabelFor(
  status: FleetOperationalStatus,
  v: VehicleData,
  de: boolean,
): string {
  switch (status) {
    case 'ready':
      return de ? 'Verfügbar' : 'Available';
    case 'critical':
      return de ? 'Kritisch' : 'Critical';
    case 'blocked':
      return de ? 'Blockiert' : 'Blocked';
    case 'warning':
      if (selectFleetActiveIsOverdue(v)) return de ? 'Überfällig' : 'Overdue';
      if (selectFleetReservedIsOverdue(v)) return de ? 'Abholung überfällig' : 'Pickup overdue';
      return de ? 'Warnung' : 'Warning';
    case 'active':
      return de ? 'Aktiv' : 'Active';
    case 'reserved':
      return de ? 'Reserviert' : 'Reserved';
    case 'maintenance':
      return de ? 'Wartung' : 'Maintenance';
    default:
      return de ? 'Status nicht verfügbar' : 'Status unavailable';
  }
}

function primaryToneFor(status: FleetOperationalStatus): StatusTone {
  switch (status) {
    case 'critical':
    case 'blocked':
      return 'critical';
    case 'warning':
      return 'watch';
    case 'maintenance':
      return 'warning';
    case 'ready':
      return 'success';
    case 'active':
    case 'reserved':
      return 'info';
    default:
      return 'neutral';
  }
}

function resolveHealthDisplay(
  v: VehicleData,
  rentalHealth: VehicleHealthResponse | null,
  de: boolean,
): FleetHealthDisplay {
  const serviceModule = rentalHealth?.modules?.service_compliance;
  let status: FleetHealthStatus;
  if (isHealthCritical(v, rentalHealth)) status = 'critical';
  else if (serviceModule?.state === 'critical') status = 'critical';
  else if (isHealthWarning(v, rentalHealth)) status = 'warning';
  else if (serviceModule?.state === 'warning') status = 'warning';
  else {
    const hasData = rentalHealth != null || Boolean(v.healthStatus);
    status = hasData ? 'good' : 'unknown';
  }

  const labels: Record<FleetHealthStatus, [string, string]> = {
    good: ['Good', 'Gut'],
    warning: ['Warning', 'Warnung'],
    critical: ['Critical', 'Kritisch'],
    unknown: [VEHICLE_OPERATIONAL_STATUS.UNKNOWN, 'Unbekannt'],
  };
  const tones: Record<FleetHealthStatus, StatusTone> = {
    good: 'success',
    warning: 'warning',
    critical: 'critical',
    unknown: 'neutral',
  };
  return { status, label: de ? labels[status][1] : labels[status][0], tone: tones[status] };
}

/**
 * Rental availability is intentionally independent of health warnings. Only a
 * genuine rental blocker (rental_blocked / visual.isBlocked) or a hard offline
 * device makes an Available vehicle "Not Ready" — a warning health state alone
 * never does, and soft-offline / standby never do.
 */
function resolveRentalDisplay(
  v: VehicleData,
  rentalHealth: VehicleHealthResponse | null,
  visual: FleetVisualState,
  de: boolean,
): FleetRentalDisplay {
  const operationalStatus = selectOperationalStatus(v);
  let rentalStatus: FleetRentalAvailability;
  if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED) rentalStatus = 'active';
  else if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.RESERVED) rentalStatus = 'reserved';
  else if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) rentalStatus = 'maintenance';
  else if (operationalStatus === VEHICLE_OPERATIONAL_STATUS.AVAILABLE) {
    const blocked = hasHardRentalBlockingReasons(rentalHealth) || visual.isBlocked;
    if (blocked) rentalStatus = 'blocked';
    else if (visual.isOffline) rentalStatus = 'not_ready';
    else rentalStatus = 'ready';
  } else {
    rentalStatus = 'not_ready';
  }

  const labels: Record<FleetRentalAvailability, [string, string]> = {
    ready: ['Ready', 'Bereit'],
    not_ready: ['Not Ready', 'Nicht bereit'],
    active: ['Active', 'Aktiv'],
    reserved: [
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, 'en'),
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, 'de'),
    ],
    maintenance: [
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, 'en'),
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, 'de'),
    ],
    blocked: ['Blocked', 'Blockiert'],
  };
  const tones: Record<FleetRentalAvailability, StatusTone> = {
    ready: 'success',
    not_ready: 'warning',
    active: 'info',
    reserved: 'info',
    maintenance: 'warning',
    blocked: 'critical',
  };
  let label = de ? labels[rentalStatus][1] : labels[rentalStatus][0];
  if (rentalStatus === 'ready' && isServiceOnlyOverdueCritical(rentalHealth)) {
    label = de ? 'Bereit · Aktion nötig' : 'Ready · Action needed';
  }
  return { status: rentalStatus, label, tone: tones[rentalStatus] };
}

const GENERIC_REASONS = new Set([
  'critical vehicle health',
  'warning health status',
  'critical health',
  'warning health',
  'vehicle health',
]);

/** Reject generic health phrases and technical source IDs from user-facing chips. */
function isConcreteReason(text: string | null | undefined): boolean {
  if (!text) return false;
  const raw = String(text).trim();
  if (GENERIC_REASONS.has(raw.toLowerCase())) return false;
  const t = sanitizeUserFacingIssueText(raw);
  if (!t) return false;
  if (GENERIC_REASONS.has(t.toLowerCase())) return false;
  return true;
}

/**
 * Telemetry-freshness phrases (offline / soft offline / no signal) are already
 * surfaced calmly in the meta line — they must not be duplicated as a health
 * reason chip, and "stale" must never reach the user.
 */
function isTelemetryReason(text: string | null | undefined): boolean {
  if (!text) return false;
  return /offline|no signal|signal delayed|standby|stale/i.test(String(text));
}

type ReasonModuleKey = 'error_codes' | 'service_compliance' | 'brakes' | 'tires' | 'battery';

const REASON_MODULE_ORDER: ReasonModuleKey[] = [
  'error_codes',
  'service_compliance',
  'brakes',
  'tires',
  'battery',
];

function extractCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function moduleReasonText(
  key: ReasonModuleKey,
  module: RentalHealthModule,
  de: boolean,
): string {
  const critical = module.state === 'critical';
  switch (key) {
    case 'error_codes': {
      const n = extractCount(module.reason);
      if (n != null && n > 0) {
        if (de) return n === 1 ? '1 aktiver Fehlercode' : `${n} aktive Fehlercodes`;
        return n === 1 ? '1 active fault code' : `${n} active fault codes`;
      }
      return de ? 'Aktiver Fehlercode' : 'Active fault code';
    }
    case 'service_compliance':
      return critical
        ? de ? 'Service überfällig' : 'Service overdue'
        : de ? 'Service fällig' : 'Service due';
    case 'brakes':
      return de ? 'Bremsen prüfen' : 'Check brakes';
    case 'tires':
      return critical
        ? de ? 'Reifen prüfen' : 'Check tires'
        : de ? 'Reifen beobachten' : 'Monitor tires';
    case 'battery':
      return de ? 'Batterie prüfen' : 'Check battery';
    default:
      return de ? 'Health prüfen' : 'Check health';
  }
}

/** Pick the most important concrete module reason (critical before warning). */
function pickModuleReason(
  rentalHealth: VehicleHealthResponse | null,
  de: boolean,
): string | null {
  const modules = rentalHealth?.modules;
  if (!modules) return null;
  for (const severity of ['critical', 'warning'] as const) {
    for (const key of REASON_MODULE_ORDER) {
      const module = modules[key];
      if (module && isOperativeRentalHealthModule(key, module) && module.state === severity) {
        return moduleReasonText(key, module, de);
      }
    }
  }
  return null;
}

function buildReasonBadge(
  v: VehicleData,
  rentalHealth: VehicleHealthResponse | null,
  visual: FleetVisualState,
  health: FleetHealthStatus,
  de: boolean,
): FleetReasonBadge | null {
  const blocked = hasHardRentalBlockingReasons(rentalHealth) || visual.isBlocked;
  const tone: StatusTone =
    health === 'critical' || blocked || v.activeIsOverdue
      ? 'critical'
      : health === 'warning'
        ? 'watch'
        : 'neutral';

  const blockingReason = rentalHealth?.blocking_reasons?.find((r) => isConcreteReason(r));
  if (blockingReason) {
    return {
      text: formatUserFacingReasonLabel({ title: blockingReason }, de ? 'de' : 'en'),
      tone,
    };
  }

  const moduleReason = pickModuleReason(rentalHealth, de);
  if (moduleReason) return { text: moduleReason, tone };

  if (v.activeIsOverdue) {
    return { text: de ? 'Rückgabe überfällig' : 'Return overdue', tone: 'critical' };
  }
  if (v.reservedIsOverdue) {
    return { text: de ? 'Abholung überfällig' : 'Pickup overdue', tone: 'watch' };
  }

  if (isConcreteReason(visual.reason) && !isTelemetryReason(visual.reason)) {
    return {
      text: formatUserFacingReasonLabel({ title: visual.reason }, de ? 'de' : 'en'),
      tone,
    };
  }

  if (health === 'warning' || health === 'critical') {
    return { text: de ? 'Health prüfen' : 'Check health', tone };
  }
  return null;
}

export interface ResolveFleetVehicleDisplayOptions {
  rentalHealth?: VehicleHealthResponse | null;
  healthAlert?: VehicleHealthAlert | null;
  /** Pre-computed visual state to avoid recomputation. Derived if omitted. */
  visual?: FleetVisualState;
  locale?: string;
  /** IANA timezone for booking supplements (org/user). Defaults to Europe/Berlin. */
  timeZone?: string;
  now?: number;
  /** Compact booking supplement copy for list/map surfaces. */
  compact?: boolean;
}

export function resolveFleetVehicleDisplayState(
  vehicle: VehicleData,
  options: ResolveFleetVehicleDisplayOptions = {},
): FleetVehicleDisplayState {
  const rentalHealth = options.rentalHealth ?? null;
  const de = options.locale === 'de';
  const locale: VehicleOperationalDisplayLocale = de ? 'de' : 'en';
  const now = options.now ?? Date.now();
  const visual =
    options.visual ?? deriveFleetVisualState(vehicle, { rentalHealth });
  const displayTimeOptions = {
    locale,
    timeZone: options.timeZone,
    now,
    compact: options.compact,
  };

  const statusBadge = resolveOperationalStatusBadge(vehicle, displayTimeOptions);
  const bookingSupplement = resolveBookingSupplement(vehicle, displayTimeOptions);

  const primaryStatus = resolveOperationalStatus(vehicle, rentalHealth, visual);
  const primaryLabel = primaryLabelFor(primaryStatus, vehicle, de);
  const primaryTone = primaryToneFor(primaryStatus);

  const fresh = resolveTelemetryFreshness(vehicle, { now, locale: options.locale });
  const ageMs = fresh.signalAgeMs;
  const telemetryStatus: FleetTelemetryStatus = fresh.freshness;
  const telemetryLabel = fresh.label;
  // Only genuine connectivity problems (offline / no signal) warn the operator.
  // Standby and signal_delayed are shown calmly with no warning styling.
  const showTelemetryWarning = fresh.shouldWarnUser;

  const percent = canonicalEnergyPercent(vehicle);
  const energy: FleetEnergyDisplay = {
    kind: vehicle.isElectric ? 'battery' : 'fuel',
    percent,
    tone: fleetEnergyTone(percent),
  };

  const healthDisplay = resolveHealthDisplay(vehicle, rentalHealth, de);
  const rentalDisplay = resolveRentalDisplay(vehicle, rentalHealth, visual, de);
  const reasonBadge =
    buildReasonBadge(vehicle, rentalHealth, visual, healthDisplay.status, de) ??
    (options.healthAlert?.primaryReason && isConcreteReason(options.healthAlert.primaryReason)
      ? {
          text: formatUserFacingReasonLabel({ title: options.healthAlert.primaryReason }, de ? 'de' : 'en'),
          tone: healthDisplay.status === 'critical' ? 'critical' : 'watch',
        }
      : null);

  let criticalHint: string | undefined;
  if (primaryStatus === 'critical' || primaryStatus === 'warning' || primaryStatus === 'blocked') {
    const candidate =
      [options.healthAlert?.primaryReason, visual.reason, rentalHealth?.blocking_reasons?.[0]]
        .find((reason) => isConcreteReason(reason) && !isTelemetryReason(reason));
    criticalHint = candidate ? sanitizeUserFacingIssueText(candidate) || undefined : undefined;
  }

  return {
    statusBadge,
    bookingSupplement,
    primaryStatus,
    primaryLabel,
    primaryTone,
    telemetryStatus,
    telemetryLabel,
    showTelemetryWarning,
    signalAgeMs: ageMs,
    energy,
    odometerLabel: formatOdometer(vehicle.odometerKm, de),
    healthDisplay,
    rentalDisplay,
    reasonBadge,
    criticalHint,
  };
}

/**
 * Operational ordering score (higher = further up). Critical/blocked/warning
 * stay on top regardless of telemetry; non-urgent offline vehicles drop to the
 * very bottom, non-urgent outdated-signal vehicles are nudged down.
 */
export function fleetOperationalSortScore(display: FleetVehicleDisplayState): number {
  const base: Record<FleetOperationalStatus, number> = {
    critical: 1000,
    blocked: 1000,
    warning: 800,
    maintenance: 600,
    active: 400,
    reserved: 300,
    ready: 100,
    unknown: 50,
  };
  let score = base[display.primaryStatus];
  const urgent =
    display.primaryStatus === 'critical' ||
    display.primaryStatus === 'blocked' ||
    display.primaryStatus === 'warning';
  const offline =
    display.telemetryStatus === 'offline' || display.telemetryStatus === 'no_signal';
  if (offline && !urgent) score -= 5000;
  else if (display.telemetryStatus === 'signal_delayed' && !urgent) score -= 250;
  return score;
}

/**
 * Whether the telemetry signal is old enough to be operationally notable, i.e.
 * soft-offline (signal_delayed, ≥24h) or worse. STANDBY (15min–24h) is normal
 * and returns false — it must never inflate Attention.
 */
export function isFleetSignalOutdated(
  v: Pick<VehicleData, 'signalAgeMs' | 'lastSignal' | 'onlineStatus'>,
  now: number = Date.now(),
): boolean {
  const f = resolveTelemetryFreshness(v, { now });
  return f.isSignalDelayed || f.isOffline || f.isNoSignal;
}
