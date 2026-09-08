/**
 * EXP-021 — settlement shadow experiment policy (Reference Capture forensic-only).
 */
import { randomUUID } from 'node:crypto';

export const EXP021_PRIMARY_PROBE_DURATION_MS = 60_000;
export const EXP021_PHASE_STABILIZATION_MS = 120_000;
export const EXP021_MANDATORY_AGES_MS = [30_000, 60_000, 120_000, 180_000, 300_000, 600_000] as const;
export const EXP021_CADENCE_PHASE_ORDER_MS = [60_000, 30_000, 20_000, 10_000] as const;
export const EXP021_WHOLE_TRIP_AGES_MS = EXP021_MANDATORY_AGES_MS;
export const EXP021_FIXED_INTERVAL_PROBE_COUNT = 8;
export const EXP021_MANDATORY_SETTLEMENT_OBSERVATIONS = 48;
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
