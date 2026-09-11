/**
 * EXP-021 — canonical physical T0 authority, orchestration state, and phase provenance.
 * PRE_ROLL recording is distinct from PHYSICAL cadence phases.
 */

export const EXP021_PHYSICAL_AUTHORITY_KEY = 'exp021PhysicalAuthority';

export type Exp021OrchestrationState =
  | 'ARMED'
  | 'T0_CONFIRMED'
  | 'DRIVING'
  | 'DEGRADED'
  | 'COMPLETE'
  | 'PHYSICAL_RUN_ENDED_EARLY';

export type Exp021PhysicalAuthority = {
  canonicalT0At: string;
  firstQualifyingMovementAt: string;
  startConfirmedAt: string;
  persistedAt: string;
  orchestrationState: Exp021OrchestrationState;
  physicalPhase60StartedAt?: string | null;
  degradedReason?: string | null;
  degradedAt?: string | null;
  physicalRunEndedEarlyAt?: string | null;
};

export type HfCalibrationPhaseProvenance = 'PRE_ROLL' | 'PHYSICAL_T0' | 'PHYSICAL_TRANSITION';

export function isPhysicalPhaseProvenance(
  provenance: HfCalibrationPhaseProvenance | null | undefined,
): boolean {
  return provenance === 'PHYSICAL_T0' || provenance === 'PHYSICAL_TRANSITION';
}

export class Exp021T0ConsistencyError extends Error {
  readonly code = 'EXP021_T0_CONSISTENCY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021T0ConsistencyError';
  }
}

export class Exp021PhaseIdentityConflictError extends Error {
  readonly code = 'EXP021_PHASE_IDENTITY_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021PhaseIdentityConflictError';
  }
}

export function parseExp021PhysicalAuthority(preflightJson: unknown): Exp021PhysicalAuthority | null {
  if (!preflightJson || typeof preflightJson !== 'object' || Array.isArray(preflightJson)) {
    return null;
  }
  const raw = (preflightJson as Record<string, unknown>)[EXP021_PHYSICAL_AUTHORITY_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const authority = raw as Partial<Exp021PhysicalAuthority>;
  if (
    !authority.canonicalT0At ||
    !authority.firstQualifyingMovementAt ||
    !authority.startConfirmedAt ||
    !authority.persistedAt ||
    !authority.orchestrationState
  ) {
    return null;
  }
  return authority as Exp021PhysicalAuthority;
}

export function buildExp021PhysicalAuthority(args: {
  firstQualifyingMovementAt: Date;
  startConfirmedAt: Date;
  persistedAtMs: number;
  orchestrationState?: Exp021OrchestrationState;
}): Exp021PhysicalAuthority {
  return {
    canonicalT0At: args.firstQualifyingMovementAt.toISOString(),
    firstQualifyingMovementAt: args.firstQualifyingMovementAt.toISOString(),
    startConfirmedAt: args.startConfirmedAt.toISOString(),
    persistedAt: new Date(args.persistedAtMs).toISOString(),
    orchestrationState: args.orchestrationState ?? 'T0_CONFIRMED',
  };
}

export function mergeExp021PhysicalAuthority(
  preflightJson: unknown,
  patch: Partial<Exp021PhysicalAuthority>,
): Record<string, unknown> {
  const base =
    preflightJson && typeof preflightJson === 'object' && !Array.isArray(preflightJson)
      ? { ...(preflightJson as Record<string, unknown>) }
      : {};
  const existing = parseExp021PhysicalAuthority(base) ?? {};
  return {
    ...base,
    [EXP021_PHYSICAL_AUTHORITY_KEY]: {
      ...existing,
      ...patch,
    },
  };
}

export function resolvePersistedCanonicalT0Ms(preflightJson: unknown): number {
  const authority = parseExp021PhysicalAuthority(preflightJson);
  if (!authority?.canonicalT0At) {
    throw new Exp021T0ConsistencyError('Persisted canonical T0 authority is required');
  }
  const canonicalT0Ms = Date.parse(authority.canonicalT0At);
  if (!Number.isFinite(canonicalT0Ms)) {
    throw new Exp021T0ConsistencyError(`Invalid persisted canonical T0: ${authority.canonicalT0At}`);
  }
  return canonicalT0Ms;
}

export function assertCandidateMatchesPersistedT0(args: {
  persistedCanonicalT0At: string;
  candidateFirstQualifyingMovementAt: Date;
}): void {
  const persistedMs = Date.parse(args.persistedCanonicalT0At);
  const candidateMs = args.candidateFirstQualifyingMovementAt.getTime();
  if (!Number.isFinite(persistedMs) || persistedMs !== candidateMs) {
    throw new Exp021T0ConsistencyError(
      `canonical T0 immutable: persisted=${args.persistedCanonicalT0At} candidate=${args.candidateFirstQualifyingMovementAt.toISOString()}`,
    );
  }
}

export type OrchestratorFailureClass =
  | 'transient_provider'
  | 'recoverable_orchestration'
  | 'integrity_fatal';

export function classifyOrchestratorFailure(error: Error): OrchestratorFailureClass {
  if (error instanceof Exp021T0ConsistencyError || error instanceof Exp021PhaseIdentityConflictError) {
    return 'integrity_fatal';
  }

  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (msg.includes('lock lease lost')) return 'integrity_fatal';
  if (msg.includes('competing orchestrator')) return 'integrity_fatal';
  if (msg.includes('ownership')) return 'integrity_fatal';
  if (msg.includes('competing recording session')) return 'integrity_fatal';
  if (msg.includes('db consistency')) return 'integrity_fatal';
  if (msg.includes('exp021_t0_consistency')) return 'integrity_fatal';
  if (msg.includes('exp021_phase_identity_conflict')) return 'integrity_fatal';
  if (msg.includes('canonical t0 immutable')) return 'integrity_fatal';

  if (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('status code 429') ||
    msg.includes('status code 502') ||
    msg.includes('status code 503') ||
    msg.includes('status code 504') ||
    msg.includes('graphql') ||
    name.includes('timeouterror')
  ) {
    return 'transient_provider';
  }

  if (msg.includes('calibration phase')) return 'recoverable_orchestration';
  if (msg.includes('matches current effective phase')) return 'recoverable_orchestration';
  if (msg.includes('settlement shadow')) return 'recoverable_orchestration';
  if (msg.includes('phase activation')) return 'recoverable_orchestration';
  if (msg.includes('timed out waiting for phase')) return 'recoverable_orchestration';

  return 'integrity_fatal';
}

/**
 * Resolve seal timestamp for physical-end terminalization.
 * Never seal an active phase using a boundary that predates its start (boundary race).
 */
export function resolvePhysicalEndSealMs(args: {
  nowMs: number;
  physicalEndBoundaryMs: number | null;
  activePhaseStartedAtMs: number | null;
}): number {
  if (args.physicalEndBoundaryMs == null) {
    return args.nowMs;
  }
  if (
    args.activePhaseStartedAtMs != null &&
    args.physicalEndBoundaryMs < args.activePhaseStartedAtMs
  ) {
    return args.nowMs;
  }
  return args.physicalEndBoundaryMs;
}

/** Active phase cannot be sealed when physical end predates its start. */
export function shouldSkipActivePhaseOnPhysicalEndEarly(args: {
  physicalEndMs: number;
  activePhaseStartedAtMs: number | null;
}): boolean {
  return (
    args.activePhaseStartedAtMs != null && args.physicalEndMs < args.activePhaseStartedAtMs
  );
}

export function isLatePlus30MisclassifiedAsActualPlus30(args: {
  scheduledAgeMs: number;
  actualAgeMs: number;
  toleranceMs?: number;
}): boolean {
  const tolerance = args.toleranceMs ?? 5_000;
  if (args.scheduledAgeMs !== 30_000) return false;
  return args.actualAgeMs > args.scheduledAgeMs + tolerance;
}
