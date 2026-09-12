/**
 * EXP-021 — canonical calibration plan authority (Reference Capture experimental scope).
 *
 * Plans are versioned; historical LOWER_BOUND_V1 (60→30→20→10) remains parseable.
 * Default env resolution remains UPPER_BOUND_V2 (180→120→60→30 CONTROL).
 * Next prospective sweet-spot run: CANDIDATE_BRACKET_V3 (120→90→60) via explicit env.
 */
export const EXP021_CALIBRATION_PLAN_SCHEMA = 'EXP021_CALIBRATION_PLAN_v1';

export type Exp021CalibrationPhaseRole = 'EXPERIMENTAL' | 'CONTROL' | 'LEGACY';

export type Exp021PhaseAdvancementMode = 'MOVING_ACCUMULATION' | 'WALL_CLOCK';

export type Exp021PhaseScientificStatus =
  | 'VALID'
  | 'DEGRADED_INSUFFICIENT_REQUESTS'
  | 'DEGRADED_LOW_MOVEMENT'
  | 'INVALID_RUNTIME_FAILURE';

export type Exp021CalibrationPhaseSpec = {
  cadenceMs: number;
  targetDurationMs: number;
  role: Exp021CalibrationPhaseRole;
  /** Minimum clean successful HF historical requests when scheduling permits. */
  minSuccessfulRequests: number;
};

/** Immutable experiment identity persisted at arm time — not transient process.env. */
export type Exp021CalibrationPlanAuthority = {
  planId: string;
  planVersion: string;
};

export type Exp021CalibrationPlan = {
  schemaVersion: typeof EXP021_CALIBRATION_PLAN_SCHEMA;
  planVersion: string;
  planId: string;
  advancementMode: Exp021PhaseAdvancementMode;
  phases: readonly Exp021CalibrationPhaseSpec[];
  /** Hard ceiling for total physical run after canonical T0 (ms). */
  maxTotalDurationMs: number;
  /** Bounded grace budget across the full run (ms); not per-phase extension for failed 180s. */
  totalGraceBudgetMs: number;
  /** Legacy MOVING accumulation gate — only for LOWER_BOUND_V1. */
  legacyMovementRequirementMs?: number;
};

const LOWER_BOUND_V1_PHASES: readonly Exp021CalibrationPhaseSpec[] = [
  { cadenceMs: 60_000, targetDurationMs: 300_000, role: 'LEGACY', minSuccessfulRequests: 5 },
  { cadenceMs: 30_000, targetDurationMs: 300_000, role: 'LEGACY', minSuccessfulRequests: 5 },
  { cadenceMs: 20_000, targetDurationMs: 300_000, role: 'LEGACY', minSuccessfulRequests: 5 },
  { cadenceMs: 10_000, targetDurationMs: 300_000, role: 'LEGACY', minSuccessfulRequests: 5 },
];

const UPPER_BOUND_V2_PHASES: readonly Exp021CalibrationPhaseSpec[] = [
  {
    cadenceMs: 180_000,
    targetDurationMs: 15 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
  {
    cadenceMs: 120_000,
    targetDurationMs: 10 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
  {
    cadenceMs: 60_000,
    targetDurationMs: 5 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
  {
    cadenceMs: 30_000,
    targetDurationMs: 3 * 60_000,
    role: 'CONTROL',
    minSuccessfulRequests: 5,
  },
];

/** Historical KS MS 661 / EXP-021 lower-bound design (60→30→20→10, ~300s MOVING per phase). */
export const EXP021_LOWER_BOUND_V1: Exp021CalibrationPlan = Object.freeze({
  schemaVersion: EXP021_CALIBRATION_PLAN_SCHEMA,
  planVersion: 'EXP021_LOWER_BOUND_V1',
  planId: 'lower_bound_v1',
  advancementMode: 'MOVING_ACCUMULATION',
  phases: LOWER_BOUND_V1_PHASES,
  maxTotalDurationMs: 45 * 60_000,
  totalGraceBudgetMs: 0,
  legacyMovementRequirementMs: 300_000,
});

/** Historical upper-bound design (180→120→60→30 CONTROL, ~33 min nominal). */
export const EXP021_UPPER_BOUND_V2: Exp021CalibrationPlan = Object.freeze({
  schemaVersion: EXP021_CALIBRATION_PLAN_SCHEMA,
  planVersion: 'EXP021_UPPER_BOUND_V2',
  planId: 'upper_bound_v2',
  advancementMode: 'WALL_CLOCK',
  phases: UPPER_BOUND_V2_PHASES,
  maxTotalDurationMs: 35 * 60_000,
  totalGraceBudgetMs: 2 * 60_000,
});

const CANDIDATE_BRACKET_V3_PHASES: readonly Exp021CalibrationPhaseSpec[] = [
  {
    cadenceMs: 120_000,
    targetDurationMs: 10 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
  {
    cadenceMs: 90_000,
    targetDurationMs: 10 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
  {
    cadenceMs: 60_000,
    targetDurationMs: 10 * 60_000,
    role: 'EXPERIMENTAL',
    minSuccessfulRequests: 5,
  },
];

/**
 * Prospective sweet-spot bracket (120→90→60, equal 10 min wall phases, ~30 min nominal).
 * Select explicitly via EXP021_CALIBRATION_PLAN=CANDIDATE_BRACKET_V3 — not the default.
 */
export const EXP021_CANDIDATE_BRACKET_V3: Exp021CalibrationPlan = Object.freeze({
  schemaVersion: EXP021_CALIBRATION_PLAN_SCHEMA,
  planVersion: 'EXP021_CANDIDATE_BRACKET_V3',
  planId: 'candidate_bracket_v3',
  advancementMode: 'WALL_CLOCK',
  phases: CANDIDATE_BRACKET_V3_PHASES,
  maxTotalDurationMs: 32 * 60_000,
  totalGraceBudgetMs: 2 * 60_000,
});

export const EXP021_DEFAULT_CALIBRATION_PLAN = EXP021_UPPER_BOUND_V2;

/** @deprecated Historical alias — KS MS 661 physical run sequence. */
export const EXP021_LEGACY_CADENCE_PHASE_ORDER_MS = EXP021_LOWER_BOUND_V1.phases.map(
  (p) => p.cadenceMs,
);

const PLAN_REGISTRY: Record<string, Exp021CalibrationPlan> = {
  UPPER_BOUND_V2: EXP021_UPPER_BOUND_V2,
  CANDIDATE_BRACKET_V3: EXP021_CANDIDATE_BRACKET_V3,
  LOWER_BOUND_V1: EXP021_LOWER_BOUND_V1,
  '60_30_20_10': EXP021_LOWER_BOUND_V1,
};

const ALL_KNOWN_CALIBRATION_PLANS: readonly Exp021CalibrationPlan[] = [
  EXP021_LOWER_BOUND_V1,
  EXP021_UPPER_BOUND_V2,
  EXP021_CANDIDATE_BRACKET_V3,
];

export function calibrationPlanAuthorityFromPlan(
  plan: Exp021CalibrationPlan,
): Exp021CalibrationPlanAuthority {
  return { planId: plan.planId, planVersion: plan.planVersion };
}

/** Durable planId and planVersion identify different known plans — fail closed. */
export class Exp021CalibrationPlanAuthorityConflictError extends Error {
  readonly code = 'EXP021_CALIBRATION_PLAN_AUTHORITY_CONFLICT';

  constructor(
    public readonly planId: string,
    public readonly planVersion: string,
    public readonly planIdResolvesTo: string,
    public readonly planVersionResolvesTo: string,
  ) {
    super(
      `EXP-021 calibration plan authority conflict: planId=${planId} (${planIdResolvesTo}) vs planVersion=${planVersion} (${planVersionResolvesTo})`,
    );
    this.name = 'Exp021CalibrationPlanAuthorityConflictError';
  }
}

/** Persisted durable authority is present but cannot be resolved — fail closed. */
export class Exp021CalibrationPlanAuthorityInvalidError extends Error {
  readonly code = 'EXP021_CALIBRATION_PLAN_AUTHORITY_INVALID';

  constructor(
    public readonly planId: string | null,
    public readonly planVersion: string | null,
  ) {
    super(
      `EXP-021 calibration plan authority invalid or unrecognized: planId=${planId ?? 'null'} planVersion=${planVersion ?? 'null'}`,
    );
    this.name = 'Exp021CalibrationPlanAuthorityInvalidError';
  }
}

function resolvePlanById(planId: string): Exp021CalibrationPlan | null {
  return ALL_KNOWN_CALIBRATION_PLANS.find((plan) => plan.planId === planId) ?? null;
}

function resolvePlanByVersion(planVersion: string): Exp021CalibrationPlan | null {
  return ALL_KNOWN_CALIBRATION_PLANS.find((plan) => plan.planVersion === planVersion) ?? null;
}

function normalizeAuthorityField(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve by durable identity when one or both fields are present.
 * Returns null only when both fields are absent.
 * Throws on conflict or unrecognized authority (fail-closed).
 */
export function resolveExp021CalibrationPlanByIdentity(
  authority: Partial<Exp021CalibrationPlanAuthority> | null | undefined,
): Exp021CalibrationPlan | null {
  if (!authority) return null;

  const planId = normalizeAuthorityField(authority.planId);
  const planVersion = normalizeAuthorityField(authority.planVersion);

  if (!planId && !planVersion) return null;

  const byId = planId ? resolvePlanById(planId) : null;
  const byVersion = planVersion ? resolvePlanByVersion(planVersion) : null;

  if (planId && planVersion) {
    if (!byId && !byVersion) {
      throw new Exp021CalibrationPlanAuthorityInvalidError(planId, planVersion);
    }
    if (byId && byVersion && byId.planId !== byVersion.planId) {
      throw new Exp021CalibrationPlanAuthorityConflictError(
        planId,
        planVersion,
        byId.planVersion,
        byVersion.planVersion,
      );
    }
    return byId ?? byVersion;
  }

  if (planId) {
    if (!byId) throw new Exp021CalibrationPlanAuthorityInvalidError(planId, null);
    return byId;
  }

  if (!byVersion) {
    throw new Exp021CalibrationPlanAuthorityInvalidError(null, planVersion);
  }
  return byVersion;
}

/**
 * Resolve calibration plan from durable authority first; fall back to env only when
 * no persisted experiment identity exists (new experiments before arm).
 * Once durable fields are present, env is never authority (fail-closed on conflict/corruption).
 */
export function resolveExp021CalibrationPlanFromAuthority(args: {
  calibrationPlanId?: string | null;
  calibrationPlanVersion?: string | null;
  env?: NodeJS.ProcessEnv;
}): Exp021CalibrationPlan {
  const planId = normalizeAuthorityField(args.calibrationPlanId);
  const planVersion = normalizeAuthorityField(args.calibrationPlanVersion);

  if (!planId && !planVersion) {
    return resolveExp021CalibrationPlan(args.env);
  }

  const resolved = resolveExp021CalibrationPlanByIdentity({
    planId: planId ?? undefined,
    planVersion: planVersion ?? undefined,
  });
  if (!resolved) {
    throw new Exp021CalibrationPlanAuthorityInvalidError(planId, planVersion);
  }
  return resolved;
}

export function resolveExp021CalibrationPlan(
  env: NodeJS.ProcessEnv = process.env,
): Exp021CalibrationPlan {
  const raw = (env.EXP021_CALIBRATION_PLAN ?? 'UPPER_BOUND_V2').trim().toUpperCase();
  return PLAN_REGISTRY[raw] ?? EXP021_UPPER_BOUND_V2;
}

export function cadenceSequenceFromPlan(plan: Exp021CalibrationPlan): number[] {
  return plan.phases.map((p) => p.cadenceMs);
}

export function cadenceSequenceLabel(plan: Exp021CalibrationPlan): string {
  return plan.phases.map((p) => p.cadenceMs / 1000).join('_');
}

export function cadenceSequenceArrow(plan: Exp021CalibrationPlan): string {
  return plan.phases.map((p) => p.cadenceMs / 1000).join('→');
}

export function nominalTotalDurationMs(plan: Exp021CalibrationPlan): number {
  return plan.phases.reduce((sum, p) => sum + p.targetDurationMs, 0);
}

export function findPhaseSpecByCadence(
  plan: Exp021CalibrationPlan,
  cadenceMs: number,
): Exp021CalibrationPhaseSpec | undefined {
  return plan.phases.find((p) => p.cadenceMs === cadenceMs);
}

export function resolveNominalPhaseDurationMs(
  cadenceMs: number,
  plan: Exp021CalibrationPlan = EXP021_DEFAULT_CALIBRATION_PLAN,
): number {
  const spec = findPhaseSpecByCadence(plan, cadenceMs);
  if (spec) return spec.targetDurationMs;
  return plan.legacyMovementRequirementMs ?? 300_000;
}

export function buildPhaseAdvancementConfig(
  plan: Exp021CalibrationPlan,
  phaseSpec: Exp021CalibrationPhaseSpec,
): import('./reference-capture-exp-021-motion.lib').PhaseAdvancementConfig {
  if (plan.advancementMode === 'WALL_CLOCK') {
    return {
      mode: 'WALL_CLOCK',
      targetWallDurationMs: phaseSpec.targetDurationMs,
      graceBudgetMs: plan.totalGraceBudgetMs,
    };
  }
  const requiredMovementMs =
    plan.legacyMovementRequirementMs ?? phaseSpec.targetDurationMs;
  return { mode: 'MOVING_ACCUMULATION', requiredMovementMs };
}

export function classifyPhaseScientificStatus(args: {
  plan: Exp021CalibrationPlan;
  phaseSpec: Exp021CalibrationPhaseSpec;
  providerSuccessCount: number;
  validMovementDurationMs: number | null;
  wallDurationMs: number;
  runtimeFailure?: boolean;
}): Exp021PhaseScientificStatus | null {
  if (args.runtimeFailure) {
    return 'INVALID_RUNTIME_FAILURE';
  }
  if (args.validMovementDurationMs == null) {
    return null;
  }
  if (args.providerSuccessCount < args.phaseSpec.minSuccessfulRequests) {
    return 'DEGRADED_INSUFFICIENT_REQUESTS';
  }
  if (args.plan.advancementMode === 'WALL_CLOCK') {
    const minMovementMs = Math.min(
      args.wallDurationMs * 0.25,
      args.phaseSpec.targetDurationMs * 0.25,
    );
    if (args.validMovementDurationMs < minMovementMs) {
      return 'DEGRADED_LOW_MOVEMENT';
    }
    return 'VALID';
  }
  const required = args.plan.legacyMovementRequirementMs ?? args.phaseSpec.targetDurationMs;
  if (args.validMovementDurationMs < required) {
    return 'DEGRADED_LOW_MOVEMENT';
  }
  return 'VALID';
}

export function computeRequestRates(args: {
  providerRequestCount: number;
  providerSuccessCount: number;
  wallDurationMs: number;
  validMovementDurationMs: number;
}): {
  requestRatePerWallMinute: number | null;
  requestRatePerMovingMinute: number | null;
  successRatePerWallMinute: number | null;
} {
  const wallMinutes = args.wallDurationMs > 0 ? args.wallDurationMs / 60_000 : 0;
  const movingMinutes =
    args.validMovementDurationMs > 0 ? args.validMovementDurationMs / 60_000 : 0;
  return {
    requestRatePerWallMinute:
      wallMinutes > 0 ? args.providerRequestCount / wallMinutes : null,
    requestRatePerMovingMinute:
      movingMinutes > 0 ? args.providerSuccessCount / movingMinutes : null,
    successRatePerWallMinute:
      wallMinutes > 0 ? args.providerSuccessCount / wallMinutes : null,
  };
}
