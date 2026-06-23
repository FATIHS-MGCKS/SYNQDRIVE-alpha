import type { StatusTone } from '../../components/patterns';
import type { VehicleHealthResponse } from '../../lib/api';
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
 *      (ready / critical / warning / active / reserved / maintenance / blocked).
 *      Telemetry freshness never changes this.
 *   2. Telemetry Freshness — a secondary signal indicator (fresh / stale /
 *      offline). Stale is never shown as a primary status badge anymore.
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
  /** Short reason, only for critical / warning / blocked vehicles. */
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
 * offline/stale Ready vehicle still reads as "Ready" (with a separate signal
 * note), never as "Stale".
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
      return de ? 'Bereit' : 'Ready';
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
