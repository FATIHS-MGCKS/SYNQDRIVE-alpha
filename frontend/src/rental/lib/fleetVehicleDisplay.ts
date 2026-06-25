import type { StatusTone } from '../../components/patterns';
import type { RentalHealthModule, VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import type { VehicleHealthAlert } from '../DashboardInsightsContext';
import { deriveFleetVisualState, type FleetVisualState } from './fleetVisualState';
import {
  resolveTelemetryFreshness,
  type TelemetryFreshness,
} from './telemetryFreshness';

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

function isHealthCritical(v: VehicleData, rentalHealth: VehicleHealthResponse | null): boolean {
  return rentalHealth?.overall_state === 'critical' || v.healthStatus === 'Critical';
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
  const rentalBlocked = rentalHealth?.rental_blocked === true;
  const healthCritical = isHealthCritical(v, rentalHealth);
  const healthWarning = isHealthWarning(v, rentalHealth);

  if (healthCritical) return 'critical';
  if (rentalBlocked || visual.isBlocked) return 'blocked';
  if (v.status === 'Maintenance') return 'maintenance';
  if (v.activeIsOverdue || v.reservedIsOverdue || healthWarning) return 'warning';
  if (v.status === 'Active Rented') return 'active';
  if (v.status === 'Reserved') return 'reserved';
  if (v.status === 'Available') return 'ready';
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
      if (v.activeIsOverdue) return de ? 'Überfällig' : 'Overdue';
      if (v.reservedIsOverdue) return de ? 'Abholung überfällig' : 'Pickup overdue';
      return de ? 'Warnung' : 'Warning';
    case 'active':
      return de ? 'Aktiv' : 'Active';
    case 'reserved':
      return de ? 'Reserviert' : 'Reserved';
    case 'maintenance':
      return de ? 'Wartung' : 'Maintenance';
    default:
      return de ? 'Unbekannt' : 'Unknown';
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
  let status: FleetHealthStatus;
  if (isHealthCritical(v, rentalHealth)) status = 'critical';
  else if (isHealthWarning(v, rentalHealth)) status = 'warning';
  else {
    const hasData = rentalHealth != null || Boolean(v.healthStatus);
    status = hasData ? 'good' : 'unknown';
  }

  const labels: Record<FleetHealthStatus, [string, string]> = {
    good: ['Good', 'Gut'],
    warning: ['Warning', 'Warnung'],
    critical: ['Critical', 'Kritisch'],
    unknown: ['Unknown', 'Unbekannt'],
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
  let status: FleetRentalAvailability;
  if (v.status === 'Active Rented') status = 'active';
  else if (v.status === 'Reserved') status = 'reserved';
  else if (v.status === 'Maintenance') status = 'maintenance';
  else if (v.status === 'Available') {
    const blocked = rentalHealth?.rental_blocked === true || visual.isBlocked;
    if (blocked) status = 'blocked';
    else if (visual.isOffline) status = 'not_ready';
    else status = 'ready';
  } else {
    status = 'not_ready';
  }

  const labels: Record<FleetRentalAvailability, [string, string]> = {
    ready: ['Ready', 'Bereit'],
    not_ready: ['Not Ready', 'Nicht bereit'],
    active: ['Active', 'Aktiv'],
    reserved: ['Reserved', 'Reserviert'],
    maintenance: ['Maintenance', 'Wartung'],
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
  return { status, label: de ? labels[status][1] : labels[status][0], tone: tones[status] };
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
  const t = String(text).trim();
  if (!t) return false;
  if (GENERIC_REASONS.has(t.toLowerCase())) return false;
  if (/rental-health:|dashboard-health-risk|vehicle-runtime/i.test(t)) return false;
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
      if (module && module.state === severity) {
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
  const blocked = rentalHealth?.rental_blocked === true || visual.isBlocked;
  const tone: StatusTone =
    health === 'critical' || blocked || v.activeIsOverdue
      ? 'critical'
      : health === 'warning' || v.reservedIsOverdue
        ? 'watch'
        : 'neutral';

  const blockingReason = rentalHealth?.blocking_reasons?.find((r) => isConcreteReason(r));
  if (blockingReason) return { text: blockingReason, tone };

  const moduleReason = pickModuleReason(rentalHealth, de);
  if (moduleReason) return { text: moduleReason, tone };

  if (v.activeIsOverdue) {
    return { text: de ? 'Rückgabe überfällig' : 'Return overdue', tone: 'critical' };
  }
  if (v.reservedIsOverdue) {
    return { text: de ? 'Abholung überfällig' : 'Pickup overdue', tone: 'watch' };
  }

  if (isConcreteReason(visual.reason) && !isTelemetryReason(visual.reason)) {
    return { text: visual.reason as string, tone };
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
  now?: number;
}

export function resolveFleetVehicleDisplayState(
  vehicle: VehicleData,
  options: ResolveFleetVehicleDisplayOptions = {},
): FleetVehicleDisplayState {
  const rentalHealth = options.rentalHealth ?? null;
  const de = options.locale === 'de';
  const now = options.now ?? Date.now();
  const visual =
    options.visual ?? deriveFleetVisualState(vehicle, { rentalHealth });

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
          text: options.healthAlert.primaryReason,
          tone: healthDisplay.status === 'critical' ? 'critical' : 'watch',
        }
      : null);

  let criticalHint: string | undefined;
  if (primaryStatus === 'critical' || primaryStatus === 'warning' || primaryStatus === 'blocked') {
    criticalHint =
      options.healthAlert?.primaryReason ||
      visual.reason ||
      rentalHealth?.blocking_reasons?.[0] ||
      undefined;
  }

  return {
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
