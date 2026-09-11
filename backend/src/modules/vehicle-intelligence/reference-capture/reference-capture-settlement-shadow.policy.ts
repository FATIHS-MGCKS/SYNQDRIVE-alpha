/**
 * EXP-021 — settlement shadow experiment policy (Reference Capture forensic-only).
 */
import { randomUUID } from 'node:crypto';
import {
  cadenceSequenceFromPlan,
  EXP021_DEFAULT_CALIBRATION_PLAN,
  EXP021_LEGACY_CADENCE_PHASE_ORDER_MS,
  EXP021_LOWER_BOUND_V1,
  resolveNominalPhaseDurationMs,
} from './reference-capture-exp021-calibration-plan.lib';

export const EXP021_PRIMARY_PROBE_DURATION_MS = 60_000;
export const EXP021_PHASE_STABILIZATION_MS = 120_000;
/** Legacy nominal duration for LOWER_BOUND_V1 probe-B offset (KS MS 661 design). */
export const EXP021_NOMINAL_PHASE_DURATION_MS = 300_000;
/** floor(0.55 × nominal phase duration) — immutable once probe B is scheduled. */
export function resolveProbeBStartOffsetMs(nominalPhaseDurationMs: number): number {
  return Math.floor(0.55 * nominalPhaseDurationMs);
}
/** @deprecated Use resolveProbeBStartOffsetMs with plan-specific nominal duration. */
export const EXP021_PROBE_B_START_OFFSET_MS = resolveProbeBStartOffsetMs(
  EXP021_NOMINAL_PHASE_DURATION_MS,
);
export const EXP021_MANDATORY_AGES_MS = [30_000, 60_000, 120_000, 180_000, 300_000, 600_000] as const;
/** Active prospective cadence sequence (defaults to UPPER_BOUND_V2). */
export const EXP021_CADENCE_PHASE_ORDER_MS = cadenceSequenceFromPlan(
  EXP021_DEFAULT_CALIBRATION_PLAN,
) as [number, number, number, number];
/** Historical 60→30→20→10 sequence — preserved for evidence parsing. */
export { EXP021_LEGACY_CADENCE_PHASE_ORDER_MS };
export { EXP021_LOWER_BOUND_V1, EXP021_DEFAULT_CALIBRATION_PLAN };
export const EXP021_WHOLE_TRIP_AGES_MS = EXP021_MANDATORY_AGES_MS;
export const EXP021_FIXED_INTERVAL_PROBE_COUNT = 8;
export const EXP021_MANDATORY_SETTLEMENT_OBSERVATIONS = 48;
/** Legacy fixed-interval design: 2 probes × 4 phases × 6 ages. */
export const EXP021_LEGACY_FIXED_INTERVAL_QUERY_COUNT =
  EXP021_FIXED_INTERVAL_PROBE_COUNT * EXP021_MANDATORY_AGES_MS.length;
export const EXP021_WHOLE_TRIP_SHADOW_OBSERVATIONS = 6;

export type SettlementShadowProbePlan = {
  probeId: string;
  probeType: 'FIXED_INTERVAL';
  phaseLabel: string;
  phasePollIntervalMs: number;
  sourceIntervalStartMs: number;
  sourceIntervalEndMs: number;
  queryFromMs: number;
  queryToMs: number;
};

export type PhaseDurationValidation = {
  sufficient: boolean;
  insufficientPhaseDurationDetected: boolean;
  probeA: { fits: boolean; intervalStartMs: number; intervalEndMs: number };
  probeB: { fits: boolean; intervalStartMs: number; intervalEndMs: number };
};

export function formatPhaseLabel(pollIntervalMs: number): string {
  return `${pollIntervalMs / 1000}s`;
}

export function buildProbeId(pollIntervalMs: number, suffix: 'A' | 'B'): string {
  return `SP-${pollIntervalMs / 1000}-${suffix}`;
}

export function snapToSecondBoundaryMs(epochMs: number): number {
  return Math.floor(epochMs / 1000) * 1000;
}

export function validatePhaseDurationForProbes(args: {
  phaseStartedAtMs: number;
  phaseEndedAtMs: number;
  probeDurationMs: number;
  stabilizationMs: number;
}): PhaseDurationValidation {
  const phaseStart = args.phaseStartedAtMs;
  const phaseEnd = args.phaseEndedAtMs;
  const duration = phaseEnd - phaseStart;

  const probeAStart = snapToSecondBoundaryMs(phaseStart + args.stabilizationMs);
  const probeAEnd = probeAStart + args.probeDurationMs;
  const probeAFits =
    probeAStart >= phaseStart &&
    probeAEnd <= phaseEnd &&
    probeAEnd - probeAStart === args.probeDurationMs;

  const probeBStart = snapToSecondBoundaryMs(phaseStart + Math.floor(duration * 0.55));
  const probeBEnd = probeBStart + args.probeDurationMs;
  const probeBFits =
    probeBStart >= phaseStart &&
    probeBEnd <= phaseEnd &&
    probeBEnd - probeBStart === args.probeDurationMs &&
    probeBStart !== probeAStart;

  const sufficient = probeAFits && probeBFits;
  return {
    sufficient,
    insufficientPhaseDurationDetected: !sufficient,
    probeA: { fits: probeAFits, intervalStartMs: probeAStart, intervalEndMs: probeAEnd },
    probeB: { fits: probeBFits, intervalStartMs: probeBStart, intervalEndMs: probeBEnd },
  };
}

export function buildProspectiveProbeAForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
}): SettlementShadowProbePlan | null {
  const probeAStart = snapToSecondBoundaryMs(args.phaseStartedAtMs + EXP021_PHASE_STABILIZATION_MS);
  const probeAEnd = probeAStart + EXP021_PRIMARY_PROBE_DURATION_MS;
  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  return {
    probeId: buildProbeId(args.phasePollIntervalMs, 'A'),
    probeType: 'FIXED_INTERVAL',
    phaseLabel,
    phasePollIntervalMs: args.phasePollIntervalMs,
    sourceIntervalStartMs: probeAStart,
    sourceIntervalEndMs: probeAEnd,
    queryFromMs: probeAStart,
    queryToMs: probeAEnd,
  };
}

/**
 * Prospective probe B: deterministic second interval from phase start using nominal duration
 * offset only. Source [from,to] is immutable once scheduled; actual phase duration is validated
 * at completion, not used to retroactively move probe B.
 */
export function buildProspectiveProbeBForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  nominalPhaseDurationMs?: number;
}): SettlementShadowProbePlan | null {
  const nominal =
    args.nominalPhaseDurationMs ?? resolveNominalPhaseDurationMs(args.phasePollIntervalMs);
  const probeBStart = snapToSecondBoundaryMs(
    args.phaseStartedAtMs + resolveProbeBStartOffsetMs(nominal),
  );
  const probeBEnd = probeBStart + EXP021_PRIMARY_PROBE_DURATION_MS;
  const probeA = buildProspectiveProbeAForPhase(args);
  if (!probeA || probeBStart === probeA.sourceIntervalStartMs) {
    return null;
  }
  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  return {
    probeId: buildProbeId(args.phasePollIntervalMs, 'B'),
    probeType: 'FIXED_INTERVAL',
    phaseLabel,
    phasePollIntervalMs: args.phasePollIntervalMs,
    sourceIntervalStartMs: probeBStart,
    sourceIntervalEndMs: probeBEnd,
    queryFromMs: probeBStart,
    queryToMs: probeBEnd,
  };
}

export function validateProspectiveProbeBAgainstCompletedPhase(args: {
  phaseStartedAtMs: number;
  phaseEndedAtMs: number;
  prospectiveProbeB: SettlementShadowProbePlan;
}): {
  matchesCompletedGeometry: boolean;
  completedProbeBStartMs: number;
  completedProbeBEndMs: number;
  startOffsetDeltaMs: number;
} {
  const duration = args.phaseEndedAtMs - args.phaseStartedAtMs;
  const completedProbeBStartMs = snapToSecondBoundaryMs(
    args.phaseStartedAtMs + Math.floor(duration * 0.55),
  );
  const completedProbeBEndMs = completedProbeBStartMs + EXP021_PRIMARY_PROBE_DURATION_MS;
  const startOffsetDeltaMs =
    completedProbeBStartMs - args.prospectiveProbeB.sourceIntervalStartMs;
  return {
    matchesCompletedGeometry:
      completedProbeBStartMs === args.prospectiveProbeB.sourceIntervalStartMs &&
      completedProbeBEndMs === args.prospectiveProbeB.sourceIntervalEndMs,
    completedProbeBStartMs,
    completedProbeBEndMs,
    startOffsetDeltaMs,
  };
}

export function buildProbeBForCompletedPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndedAtMs: number;
}): { probe: SettlementShadowProbePlan | null; validation: PhaseDurationValidation } {
  const validation = validatePhaseDurationForProbes({
    phaseStartedAtMs: args.phaseStartedAtMs,
    phaseEndedAtMs: args.phaseEndedAtMs,
    probeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
    stabilizationMs: EXP021_PHASE_STABILIZATION_MS,
  });
  if (!validation.probeB.fits) {
    return { probe: null, validation };
  }
  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  return {
    probe: {
      probeId: buildProbeId(args.phasePollIntervalMs, 'B'),
      probeType: 'FIXED_INTERVAL',
      phaseLabel,
      phasePollIntervalMs: args.phasePollIntervalMs,
      sourceIntervalStartMs: validation.probeB.intervalStartMs,
      sourceIntervalEndMs: validation.probeB.intervalEndMs,
      queryFromMs: validation.probeB.intervalStartMs,
      queryToMs: validation.probeB.intervalEndMs,
    },
    validation,
  };
}

export function computeScheduleTimingProjection(args: {
  sourceIntervalEndMs: number;
  scheduledAgeMs: number;
  scheduleCreatedAtMs: number;
}): {
  scheduledAtMs: number;
  expectedActualAgeMsAtCreation: number;
  expectedScheduleDriftMsAtCreation: number;
  executableOnTime: boolean;
} {
  const scheduledAtMs = args.sourceIntervalEndMs + args.scheduledAgeMs;
  const expectedActualAgeMsAtCreation = Math.max(0, args.scheduleCreatedAtMs - args.sourceIntervalEndMs);
  const expectedScheduleDriftMsAtCreation = expectedActualAgeMsAtCreation - args.scheduledAgeMs;
  const executableOnTime = args.scheduleCreatedAtMs <= scheduledAtMs;
  return {
    scheduledAtMs,
    expectedActualAgeMsAtCreation,
    expectedScheduleDriftMsAtCreation,
    executableOnTime,
  };
}

export function buildTiledSettlementProbeId(pollIntervalMs: number, tileIndex: number): string {
  return `SP-${pollIntervalMs / 1000}-T${tileIndex}`;
}

/** Legacy stabilized tiling (A/B era) — retained for historical evidence parsing only. */
export const EXP021_LEGACY_STABILIZED_TILE_STEP_MS = EXP021_PRIMARY_PROBE_DURATION_MS;

/**
 * Full-phase overlapping 60s source windows from phase start (no stabilization offset).
 * Settlement ages (+30…+600) are independent of source-window position; stabilization
 * exclusion applied only to legacy A/B comparative probes.
 */
export const EXP021_FULL_PHASE_TILE_DURATION_MS = EXP021_PRIMARY_PROBE_DURATION_MS;
export const EXP021_FULL_PHASE_TILE_STEP_MS = 30_000;

export function buildLegacyStabilizedTiledSettlementProbesForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndMs: number;
}): SettlementShadowProbePlan[] {
  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  const probes: SettlementShadowProbePlan[] = [];
  let tileIndex = 0;
  for (
    let start = snapToSecondBoundaryMs(args.phaseStartedAtMs + EXP021_PHASE_STABILIZATION_MS);
    start + EXP021_PRIMARY_PROBE_DURATION_MS <= args.phaseEndMs;
    start += EXP021_PRIMARY_PROBE_DURATION_MS
  ) {
    const end = start + EXP021_PRIMARY_PROBE_DURATION_MS;
    probes.push({
      probeId: buildTiledSettlementProbeId(args.phasePollIntervalMs, tileIndex),
      probeType: 'FIXED_INTERVAL',
      phaseLabel,
      phasePollIntervalMs: args.phasePollIntervalMs,
      sourceIntervalStartMs: start,
      sourceIntervalEndMs: end,
      queryFromMs: start,
      queryToMs: end,
    });
    tileIndex += 1;
  }
  return probes;
}

export function buildFullPhaseOverlappingSettlementProbesForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndMs: number;
  tileDurationMs?: number;
  tileStepMs?: number;
}): SettlementShadowProbePlan[] {
  const tileDurationMs = args.tileDurationMs ?? EXP021_FULL_PHASE_TILE_DURATION_MS;
  const tileStepMs = args.tileStepMs ?? EXP021_FULL_PHASE_TILE_STEP_MS;
  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  const probes: SettlementShadowProbePlan[] = [];
  let tileIndex = 0;
  for (
    let start = snapToSecondBoundaryMs(args.phaseStartedAtMs);
    start + tileDurationMs <= args.phaseEndMs;
    start += tileStepMs
  ) {
    const end = start + tileDurationMs;
    probes.push({
      probeId: buildTiledSettlementProbeId(args.phasePollIntervalMs, tileIndex),
      probeType: 'FIXED_INTERVAL',
      phaseLabel,
      phasePollIntervalMs: args.phasePollIntervalMs,
      sourceIntervalStartMs: start,
      sourceIntervalEndMs: end,
      queryFromMs: start,
      queryToMs: end,
    });
    tileIndex += 1;
  }
  return probes;
}

/** @deprecated Use buildFullPhaseOverlappingSettlementProbesForPhase for UPPER_BOUND_V2. */
export function buildTiledSettlementProbesForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndMs: number;
}): SettlementShadowProbePlan[] {
  return buildFullPhaseOverlappingSettlementProbesForPhase(args);
}

export function countFullPhaseOverlappingTilesForNominalPhase(args: {
  nominalPhaseDurationMs: number;
  tileDurationMs?: number;
  tileStepMs?: number;
}): number {
  const tileDurationMs = args.tileDurationMs ?? EXP021_FULL_PHASE_TILE_DURATION_MS;
  const tileStepMs = args.tileStepMs ?? EXP021_FULL_PHASE_TILE_STEP_MS;
  if (args.nominalPhaseDurationMs < tileDurationMs) return 0;
  return Math.floor((args.nominalPhaseDurationMs - tileDurationMs) / tileStepMs) + 1;
}

export function computeUpperBoundV2SettlementQueryBudget(
  plan = EXP021_DEFAULT_CALIBRATION_PLAN,
): {
  tileCount: number;
  expectedSettlementQueryCount: number;
  maxSettlementQueryCount: number;
  legacyStabilizedTileCount: number;
  fullPhaseTileCount: number;
  nominalPhaseMinutes: number;
  legacyStabilizedCoverageMinutes: number;
} {
  let fullPhaseTileCount = 0;
  let legacyStabilizedTileCount = 0;
  let nominalPhaseMinutes = 0;
  let legacyStabilizedCoverageMinutes = 0;
  for (const phase of plan.phases) {
    nominalPhaseMinutes += phase.targetDurationMs / 60_000;
    fullPhaseTileCount += countFullPhaseOverlappingTilesForNominalPhase({
      nominalPhaseDurationMs: phase.targetDurationMs,
    });
    const legacyTiles = buildLegacyStabilizedTiledSettlementProbesForPhase({
      phasePollIntervalMs: phase.cadenceMs,
      phaseStartedAtMs: 0,
      phaseEndMs: phase.targetDurationMs,
    });
    legacyStabilizedTileCount += legacyTiles.length;
    legacyStabilizedCoverageMinutes +=
      (legacyTiles.length * EXP021_PRIMARY_PROBE_DURATION_MS) / 60_000;
  }
  const expectedSettlementQueryCount = fullPhaseTileCount * EXP021_MANDATORY_AGES_MS.length;
  return {
    tileCount: fullPhaseTileCount,
    expectedSettlementQueryCount,
    maxSettlementQueryCount: expectedSettlementQueryCount,
    legacyStabilizedTileCount,
    fullPhaseTileCount,
    nominalPhaseMinutes,
    legacyStabilizedCoverageMinutes,
  };
}

export function buildFixedIntervalProbesForPhase(args: {
  phasePollIntervalMs: number;
  phaseStartedAtMs: number;
  phaseEndedAtMs: number;
}): { probes: SettlementShadowProbePlan[]; validation: PhaseDurationValidation } {
  const validation = validatePhaseDurationForProbes({
    phaseStartedAtMs: args.phaseStartedAtMs,
    phaseEndedAtMs: args.phaseEndedAtMs,
    probeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
    stabilizationMs: EXP021_PHASE_STABILIZATION_MS,
  });

  if (!validation.sufficient) {
    return { probes: [], validation };
  }

  const phaseLabel = formatPhaseLabel(args.phasePollIntervalMs);
  const probes: SettlementShadowProbePlan[] = [
    {
      probeId: buildProbeId(args.phasePollIntervalMs, 'A'),
      probeType: 'FIXED_INTERVAL',
      phaseLabel,
      phasePollIntervalMs: args.phasePollIntervalMs,
      sourceIntervalStartMs: validation.probeA.intervalStartMs,
      sourceIntervalEndMs: validation.probeA.intervalEndMs,
      queryFromMs: validation.probeA.intervalStartMs,
      queryToMs: validation.probeA.intervalEndMs,
    },
    {
      probeId: buildProbeId(args.phasePollIntervalMs, 'B'),
      probeType: 'FIXED_INTERVAL',
      phaseLabel,
      phasePollIntervalMs: args.phasePollIntervalMs,
      sourceIntervalStartMs: validation.probeB.intervalStartMs,
      sourceIntervalEndMs: validation.probeB.intervalEndMs,
      queryFromMs: validation.probeB.intervalStartMs,
      queryToMs: validation.probeB.intervalEndMs,
    },
  ];

  return { probes, validation };
}

export function buildScheduleIdempotencyKey(args: {
  experimentId: string;
  probeId: string;
  scheduledAgeMs: number;
}): string {
  return `${args.experimentId}|${args.probeId}|${args.scheduledAgeMs}`;
}

export function buildWholeTripProbeId(ageMs: number): string {
  return `WT-${ageMs / 1000}`;
}

export function buildExperimentId(sessionId: string): string {
  return `exp-021-${sessionId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
}

export function computeActualAgeMs(requestStartedAtMs: number, sourceIntervalEndMs: number): number {
  return requestStartedAtMs - sourceIntervalEndMs;
}

export function computeScheduleDriftMs(actualAgeMs: number, scheduledAgeMs: number): number {
  return actualAgeMs - scheduledAgeMs;
}
