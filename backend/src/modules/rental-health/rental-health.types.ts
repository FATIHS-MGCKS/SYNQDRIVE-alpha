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

/**
 * Data/pipeline availability for the Rental Health V1 aggregate.
 *
 * Orthogonal to {@link HealthState} (`overall_state` severity) and
 * {@link VehicleHealth.rental_blocked} (operational gate). Describes whether
 * module evaluators successfully produced responses — not whether the vehicle
 * is healthy.
 *
 * Additive V1 field: existing clients may ignore it; no URL version bump.
 */
export type RentalHealthAvailabilityState = 'ready' | 'partial' | 'unavailable';

/** Per-module pipeline outcome used by {@link computeRentalHealthAvailability}. */
export type ModulePipelineAvailability = 'available' | 'unavailable' | 'not_applicable';

export const RENTAL_HEALTH_MODULE_KEYS = [
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'service_compliance',
  'complaints',
  'vehicle_alerts',
] as const;

export type RentalHealthModuleKey = (typeof RENTAL_HEALTH_MODULE_KEYS)[number];

export interface ModuleAvailabilityInput {
  key: RentalHealthModuleKey;
  state: HealthState;
  pipeline_availability: ModulePipelineAvailability;
}

export interface ModuleHealth {
  state: HealthState;
  reason: string;
  last_updated_at: string | null; // ISO 8601 — null when no data has ever been seen
  data_stale: boolean;
  /**
   * Whether the module evaluator responded successfully.
   * `false` signals a pipeline/load failure — distinct from `state: unknown`
   * when data is simply missing but the evaluator ran.
   */
  pipeline_available?: boolean;
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
    | 'legacy_unverified'
    | 'unknown';
}

export interface VehicleHealth {
  vehicle_id: string;
  organization_id: string;
  overall_state: HealthState;
  /** Data/pipeline coverage across applicable modules — not health severity. */
  availability: RentalHealthAvailabilityState;
  /**
   * Operational rental gate. `null` when pipeline coverage is incomplete
   * (`availability` is `partial` or `unavailable`) — never a confirmed safe false.
   */
  rental_blocked: boolean | null;
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
  /** Present when the aggregate was degraded — safe operator copy, no internals. */
  degradation?: RentalHealthDegradation;
}

export const RENTAL_HEALTH_DEGRADATION_CODES = {
  PIPELINE_UNAVAILABLE: 'PIPELINE_UNAVAILABLE',
} as const;

export type RentalHealthDegradationCode =
  (typeof RENTAL_HEALTH_DEGRADATION_CODES)[keyof typeof RENTAL_HEALTH_DEGRADATION_CODES];

export interface RentalHealthDegradation {
  code: RentalHealthDegradationCode;
  message: string;
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
 * Resolve pipeline availability for one module.
 *
 * Pipeline failures (`loadFailed`) are never folded into `state: unknown`
 * semantics — they map to `unavailable` here while successful evaluators
 * with missing data remain `available`.
 */
export function resolveModulePipelineAvailability(
  state: HealthState,
  options: { loadFailed?: boolean } = {},
): ModulePipelineAvailability {
  if (state === 'n_a') return 'not_applicable';
  if (options.loadFailed) return 'unavailable';
  return 'available';
}

/**
 * Aggregate vehicle-level data/pipeline availability.
 *
 *   all applicable modules available  → ready
 *   some available, some unavailable  → partial (module payloads preserved)
 *   none available                    → unavailable
 *   every module not_applicable       → unavailable
 */
export function computeRentalHealthAvailability(
  modules: ReadonlyArray<ModuleAvailabilityInput>,
): RentalHealthAvailabilityState {
  const applicable = modules.filter((m) => m.pipeline_availability !== 'not_applicable');
  if (applicable.length === 0) return 'unavailable';

  const availableCount = applicable.filter(
    (m) => m.pipeline_availability === 'available',
  ).length;
  if (availableCount === 0) return 'unavailable';
  if (availableCount === applicable.length) return 'ready';
  return 'partial';
}

/**
 * Build availability inputs from module states and per-key load failures.
 * Does not mutate module payloads — safe to call after module assembly.
 */
export function buildModuleAvailabilityInputs(
  modules: Record<RentalHealthModuleKey, Pick<ModuleHealth, 'state'>>,
  loadFailures: Partial<Record<RentalHealthModuleKey, boolean>> = {},
): ModuleAvailabilityInput[] {
  return RENTAL_HEALTH_MODULE_KEYS.map((key) => ({
    key,
    state: modules[key].state,
    pipeline_availability: resolveModulePipelineAvailability(modules[key].state, {
      loadFailed: loadFailures[key] === true,
    }),
  }));
}

/**
 * Annotate module payloads with `pipeline_available` and compute aggregate availability.
 */
export function finalizeVehicleHealthAvailability<T extends Record<RentalHealthModuleKey, ModuleHealth>>(
  modules: T,
  loadFailures: Partial<Record<RentalHealthModuleKey, boolean>> = {},
): { modules: T; availability: RentalHealthAvailabilityState } {
  const annotated = { ...modules } as T;
  for (const key of RENTAL_HEALTH_MODULE_KEYS) {
    const loadFailed = loadFailures[key] === true;
    annotated[key] = {
      ...modules[key],
      pipeline_available: !loadFailed,
    };
  }
  const availability = computeRentalHealthAvailability(
    buildModuleAvailabilityInputs(annotated, loadFailures),
  );
  return { modules: annotated, availability };
}

/**
 * Resolve rental_blocked only when the pipeline is fully ready.
 * Partial/unavailable coverage must not emit a confirmed `false`.
 */
export function resolveRentalBlockedState(
  availability: RentalHealthAvailabilityState,
  blockingReasons: string[],
): boolean | null {
  if (availability !== 'ready') return null;
  return blockingReasons.length > 0;
}

export function isRentalBlockedConfirmed(
  rentalBlocked: boolean | null | undefined,
): rentalBlocked is true {
  return rentalBlocked === true;
}

export function isRentalBlockedVerified(
  rentalBlocked: boolean | null | undefined,
): rentalBlocked is boolean {
  return rentalBlocked !== null && rentalBlocked !== undefined;
}

function stubDegradedModule(): ModuleHealth {
  return {
    state: 'unknown',
    reason: 'Daten nicht verfügbar',
    last_updated_at: null,
    data_stale: true,
    pipeline_available: false,
  };
}

/**
 * Deterministic per-vehicle degrade payload for fleet fan-out failures.
 * Never asserts `rental_blocked: false` on pipeline errors.
 */
export function buildDegradedVehicleHealth(params: {
  vehicle_id: string;
  organization_id: string;
  availability?: RentalHealthAvailabilityState;
  degradation?: RentalHealthDegradation;
}): VehicleHealth {
  const modules = RENTAL_HEALTH_MODULE_KEYS.reduce(
    (acc, key) => {
      acc[key] = stubDegradedModule();
      return acc;
    },
    {} as VehicleHealth['modules'],
  );

  return {
    vehicle_id: params.vehicle_id,
    organization_id: params.organization_id,
    overall_state: 'unknown',
    availability: params.availability ?? 'unavailable',
    rental_blocked: null,
    blocking_reasons: [],
    modules,
    generated_at: new Date().toISOString(),
    ...(params.degradation ? { degradation: params.degradation } : {}),
  };
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
