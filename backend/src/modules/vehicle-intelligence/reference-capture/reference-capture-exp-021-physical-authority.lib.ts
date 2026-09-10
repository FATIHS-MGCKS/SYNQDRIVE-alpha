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
  | 'COMPLETE';

export type Exp021PhysicalAuthority = {
  canonicalT0At: string;
  firstQualifyingMovementAt: string;
  startConfirmedAt: string;
  persistedAt: string;
  orchestrationState: Exp021OrchestrationState;
  physicalPhase60StartedAt?: string | null;
  degradedReason?: string | null;
  degradedAt?: string | null;
};

export type HfCalibrationPhaseProvenance = 'PRE_ROLL' | 'PHYSICAL_T0' | 'PHYSICAL_TRANSITION';

export function isPhysicalPhaseProvenance(
  provenance: HfCalibrationPhaseProvenance | null | undefined,
): boolean {
  return provenance === 'PHYSICAL_T0' || provenance === 'PHYSICAL_TRANSITION';
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

export type OrchestratorFailureClass = 'integrity' | 'orchestration';

export function classifyOrchestratorFailure(error: Error): OrchestratorFailureClass {
  const msg = error.message.toLowerCase();
  if (msg.includes('lock lease lost')) return 'integrity';
  if (msg.includes('competing orchestrator')) return 'integrity';
  if (msg.includes('ownership')) return 'integrity';
  if (msg.includes('competing recording session')) return 'integrity';
  if (msg.includes('db consistency')) return 'integrity';
  if (msg.includes('calibration phase')) return 'orchestration';
  if (msg.includes('matches current effective phase')) return 'orchestration';
  if (msg.includes('settlement shadow')) return 'orchestration';
  if (msg.includes('phase activation')) return 'orchestration';
  if (msg.includes('timed out waiting for phase')) return 'orchestration';
  return 'orchestration';
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
