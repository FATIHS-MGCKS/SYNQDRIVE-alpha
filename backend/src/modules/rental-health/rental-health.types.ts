/**
 * Rental Health V1 — canonical types.
 *
 * These are the contract shared with the frontend. They intentionally do
 * NOT leak any module-internal fields (voltageV, tireWearPercent, etc.) —
 * the UI is supposed to render exactly this shape and nothing else.
 *
 * The five HealthStates are immutable across modules and the overall
 * aggregate. `unknown` is never silently collapsed to `good`; `n_a`
 * means the module is structurally not applicable for this vehicle
 * (e.g. TPMS not fitted, EV with no HV stack, etc.).
 *
 * Every ModuleHealth always carries a reason string, a timestamp and a
 * data_stale flag so the UI has a uniform render path.
 */

export type HealthState = 'good' | 'warning' | 'critical' | 'unknown' | 'n_a';

export interface ModuleHealth {
  state: HealthState;
  reason: string;
  last_updated_at: string | null; // ISO 8601 — null when no data has ever been seen
  data_stale: boolean;
  /** Data origin when known — e.g. hm_oem, dtc_poll, canonical_battery. */
  source?: string;
  /** How the module state was derived — never fabricated. */
  evidence_type?:
    | 'measured'
    | 'estimated'
    | 'provider'
    | 'manual'
    | 'document'
    | 'sensor'
    | 'complaint'
    | 'unknown';
}

export interface VehicleHealth {
  vehicle_id: string;
  organization_id: string;
  overall_state: HealthState;
  rental_blocked: boolean;
  blocking_reasons: string[];
  modules: {
    battery: ModuleHealth;
    tires: ModuleHealth;
    brakes: ModuleHealth;
    error_codes: ModuleHealth;
    service_compliance: ModuleHealth;
    complaints: ModuleHealth;
    vehicle_alerts: ModuleHealth;
  };
  generated_at: string; // ISO 8601
}

/** Alias for the canonical per-vehicle health aggregate; {@link RentalHealthService} is the VehicleHealthStatus aggregator. */
export type VehicleHealthStatus = VehicleHealth;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Stale threshold for the per-module data_stale flag. */
export const RENTAL_HEALTH_STALE_MS = 48 * 60 * 60 * 1000;

/**
 * Severity ranking used by {@link computeOverallState}.
 *   critical (4) > warning (3) > good (2) > unknown (1) > n_a (0)
 * Modules with state `n_a` are excluded from the aggregate entirely.
 */
export const HEALTH_SEVERITY: Record<HealthState, number> = {
  n_a: 0,
  unknown: 1,
  good: 2,
  warning: 3,
  critical: 4,
};

/**
 * Deterministic aggregate over all non-n_a modules.
 *
 *   any critical        → critical
 *   any warning         → warning
 *   any unknown         → unknown  (NOT promoted to good — missing data
 *                                    must never look healthy)
 *   every applicable module is good → good
 *   every module is n_a             → unknown (we have nothing to say)
 */
export function computeOverallState(
  modules: Array<Pick<ModuleHealth, 'state'>>,
): HealthState {
  const applicable = modules.filter((m) => m.state !== 'n_a');
  if (applicable.length === 0) return 'unknown';
  if (applicable.some((m) => m.state === 'critical')) return 'critical';
  if (applicable.some((m) => m.state === 'warning')) return 'warning';
  if (applicable.some((m) => m.state === 'unknown')) return 'unknown';
  return 'good';
}

/**
 * Returns the higher-severity state of two inputs (used when a module
 * combines sub-states, e.g. tire wear-state + pressure-state).
 */
export function maxSeverity(a: HealthState, b: HealthState): HealthState {
  return HEALTH_SEVERITY[a] >= HEALTH_SEVERITY[b] ? a : b;
}

/**
 * Compute the `data_stale` flag from a timestamp (ISO or Date).
 * Returns `true` if older than {@link RENTAL_HEALTH_STALE_MS} or if no
 * timestamp is available at all.
 */
export function isStale(ts: string | Date | null | undefined): boolean {
  if (!ts) return true;
  const millis = typeof ts === 'string' ? Date.parse(ts) : ts.getTime();
  if (!Number.isFinite(millis)) return true;
  return Date.now() - millis > RENTAL_HEALTH_STALE_MS;
}

/** Normalize any Date / ISO / null into an ISO string (or null). */
export function toIso(ts: string | Date | null | undefined): string | null {
  if (!ts) return null;
  try {
    return typeof ts === 'string'
      ? new Date(ts).toISOString()
      : ts.toISOString();
  } catch {
    return null;
  }
}

// ── Error shape for rental_blocked bookings gate ─────────────────────────────

export interface RentalBlockedErrorPayload {
  code: 'VEHICLE_RENTAL_BLOCKED';
  blocking_reasons: string[];
  vehicle_id: string;
}
