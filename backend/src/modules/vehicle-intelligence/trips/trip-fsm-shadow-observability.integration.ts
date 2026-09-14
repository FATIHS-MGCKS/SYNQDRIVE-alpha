import type { TripDetectionState } from '@prisma/client';
import type {
  EmptyCoreForensics,
  EmptyCoreVlsTelemetry,
} from './trip-empty-core-end-gate';
import type { StopBoundaryProvenance } from './trip-fsm-clock-contract';
import { isTripFsmShadowObservabilityEnabledForVehicle } from './trip-fsm-shadow-observability.config';
import { evaluateProviderSilenceShadow } from './trip-fsm-shadow-provider-silence.evaluator';
import {
  applyProviderSilenceShadowEvaluation,
  buildShadowTerminalSummary,
  mergeShadowObservabilityIntoSummary,
  readShadowObservabilityState,
  recordShadowPauseResume,
  startShadowPauseEpisode,
} from './trip-fsm-shadow-summary.builder';

export type ShadowActiveTickContext = {
  vehicleId: string;
  tripId: string | null;
  activeTripId: string | null;
  fsmState: TripDetectionState;
  workerNow: Date;
  operationalInactiveMs: number;
  minInactivityBeforeCusumMs: number;
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  stopBoundaryProvenance?: StopBoundaryProvenance | null;
  performanceActivity: boolean;
  routeMotion: boolean;
  hasCrediblePostMovement: boolean;
  providerSilenceAnchorAt: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  lastProviderActivityAt?: Date | null;
  emptyCoreForensics?: EmptyCoreForensics | null;
  realWinningEndPath?: string | null;
  endCycleGeneration?: string | null;
  priorSummary: Record<string, unknown> | null | undefined;
  evaluateProviderSilence?: boolean;
};

export type ShadowPauseStartContext = {
  vehicleId: string;
  tripId: string | null;
  activeTripId: string | null;
  fsmState: TripDetectionState;
  workerNow: Date;
  episodeStartSource: string;
  stopAnchorAt: Date | null;
  possibleEndAt: Date | null;
  completedAt: Date | null;
  restingAt: Date | null;
  priorSummary: Record<string, unknown> | null | undefined;
};

export type ShadowResumeContext = {
  vehicleId: string;
  tripId: string | null;
  activeTripId: string | null;
  fsmState: TripDetectionState;
  workerNow: Date;
  movementEvidenceSource: string;
  completedAt?: Date | null;
  restingAt?: Date | null;
  realEndValidationAt?: Date | null;
  invalidatedByMovement?: boolean;
  priorSummary: Record<string, unknown> | null | undefined;
};

export function isShadowEnabledForVehicle(vehicleId: string): boolean {
  return isTripFsmShadowObservabilityEnabledForVehicle(vehicleId);
}

export function runShadowActiveTickObservation(
  ctx: ShadowActiveTickContext,
): Record<string, unknown> | null {
  if (!isShadowEnabledForVehicle(ctx.vehicleId)) return null;

  let state = readShadowObservabilityState(ctx.priorSummary);

  if (ctx.evaluateProviderSilence) {
    const evaluation = evaluateProviderSilenceShadow({
      operationalInactiveMs: ctx.operationalInactiveMs,
      minInactivityBeforeCusumMs: ctx.minInactivityBeforeCusumMs,
      telemetry: ctx.telemetry,
      profile: ctx.profile,
      workerNow: ctx.workerNow,
      stopBoundaryProvenance: ctx.stopBoundaryProvenance,
      performanceActivity: ctx.performanceActivity,
      routeMotion: ctx.routeMotion,
      hasCrediblePostMovement: ctx.hasCrediblePostMovement,
      providerSilenceAnchorAt: ctx.providerSilenceAnchorAt,
      lastMeaningfulMovementAt: ctx.lastMeaningfulMovementAt,
      lastProviderActivityAt: ctx.lastProviderActivityAt,
      emptyCoreForensics: ctx.emptyCoreForensics,
      realWinningEndPath: ctx.realWinningEndPath,
      activeTripId: ctx.activeTripId,
      observedTripId: ctx.tripId,
      endCycleGeneration: ctx.endCycleGeneration,
      observedEndCycleGeneration: ctx.endCycleGeneration,
    });
    state = applyProviderSilenceShadowEvaluation(state, evaluation);
  }

  return mergeShadowObservabilityIntoSummary(ctx.priorSummary, state);
}

export function runShadowPauseStartObservation(
  ctx: ShadowPauseStartContext,
): Record<string, unknown> | null {
  if (!isShadowEnabledForVehicle(ctx.vehicleId)) return null;

  let state = readShadowObservabilityState(ctx.priorSummary);
  state = startShadowPauseEpisode(state, {
    vehicleId: ctx.vehicleId,
    tripId: ctx.tripId,
    episodeStartedAt: ctx.workerNow,
    episodeStartSource: ctx.episodeStartSource,
    bestObservedStopAnchorAt: ctx.stopAnchorAt,
    realFsmStateAtPauseStart: ctx.fsmState,
    possibleEndAt: ctx.possibleEndAt,
    completedAt: ctx.completedAt,
    restingAt: ctx.restingAt,
    activeTripIdAtPauseStart: ctx.activeTripId,
    realPossibleEndAt: ctx.possibleEndAt,
  });

  return mergeShadowObservabilityIntoSummary(ctx.priorSummary, state);
}

export function runShadowResumeObservation(
  ctx: ShadowResumeContext,
): Record<string, unknown> | null {
  if (!isShadowEnabledForVehicle(ctx.vehicleId)) return null;

  let state = readShadowObservabilityState(ctx.priorSummary);
  state = recordShadowPauseResume(state, {
    resumeAt: ctx.workerNow,
    movementEvidenceSource: ctx.movementEvidenceSource,
    fsmStateAtResume: ctx.fsmState,
    activeTripIdAtResume: ctx.activeTripId,
    tripIdAtResume: ctx.tripId,
    completedAt: ctx.completedAt,
    restingAt: ctx.restingAt,
    realEndValidationAt: ctx.realEndValidationAt,
    invalidatedByMovement: ctx.invalidatedByMovement,
  });

  return mergeShadowObservabilityIntoSummary(ctx.priorSummary, state);
}

export function runShadowFinalizeObservation(input: {
  vehicleId: string;
  priorSummary: Record<string, unknown> | null | undefined;
  realEndPath: string | null;
}): {
  evidenceSummaryPatch: Record<string, unknown> | null;
  terminalSummary: ReturnType<typeof buildShadowTerminalSummary> | null;
} {
  if (!isShadowEnabledForVehicle(input.vehicleId)) {
    return { evidenceSummaryPatch: null, terminalSummary: null };
  }

  let state = readShadowObservabilityState(input.priorSummary);
  if (input.realEndPath) {
    state = {
      ...state,
      providerSilence: {
        ...state.providerSilence,
        realWinningEndPath:
          input.realEndPath ?? state.providerSilence.realWinningEndPath,
      },
    };
  }

  const terminalSummary = buildShadowTerminalSummary(state);
  const evidenceSummaryPatch = mergeShadowObservabilityIntoSummary(
    input.priorSummary,
    state,
  );

  return { evidenceSummaryPatch, terminalSummary };
}

export function attachShadowToResultSummary(
  resultSummary: Record<string, unknown> | null | undefined,
  shadowPatch: Record<string, unknown> | null,
): Record<string, unknown> | null | undefined {
  if (!shadowPatch?.shadowObservability) return resultSummary;
  return {
    ...(resultSummary ?? {}),
    shadowObservability: shadowPatch.shadowObservability,
  };
}
