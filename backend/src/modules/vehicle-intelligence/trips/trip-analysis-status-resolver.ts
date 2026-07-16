import { shouldFullySkipAnalysis } from './trip-analysis-status';
import {
  TRIP_ANALYSIS_STAGE_KEYS,
  type ResolvedTripAnalysisStatus,
  type TripAnalysisStageKey,
  type TripAnalysisStageRuntimeState,
  type TripAnalysisStageSnapshot,
  type TripAnalysisStatusResolverInput,
  type TripAnalysisStatusResolverResult,
} from './trip-analysis-status-resolver.types';

const REQUIRED_FOR_COMPLETE: TripAnalysisStageKey[] = [
  'behavior',
  'route',
  'misuse',
  'drivingImpact',
];

const OPTIONAL_STAGES: TripAnalysisStageKey[] = [
  'nativeEvents',
  'eventContext',
  'attribution',
];

function stageValue(
  stages: TripAnalysisStageSnapshot,
  key: TripAnalysisStageKey,
): TripAnalysisStageRuntimeState {
  return stages[key];
}

function isPending(state: TripAnalysisStageRuntimeState): boolean {
  return state === 'pending';
}

function isFailed(state: TripAnalysisStageRuntimeState): boolean {
  return state === 'failed';
}

function isDone(state: TripAnalysisStageRuntimeState): boolean {
  return state === 'done';
}

function isCapabilityTerminal(state: TripAnalysisStageRuntimeState): boolean {
  return state === 'skipped' || state === 'not_required';
}

function isSuccessfulTerminal(state: TripAnalysisStageRuntimeState): boolean {
  return isDone(state) || isCapabilityTerminal(state);
}

function isTerminal(state: TripAnalysisStageRuntimeState): boolean {
  return isSuccessfulTerminal(state) || isFailed(state);
}

function listStagesWhere(
  stages: TripAnalysisStageSnapshot,
  predicate: (state: TripAnalysisStageRuntimeState) => boolean,
): TripAnalysisStageKey[] {
  return TRIP_ANALYSIS_STAGE_KEYS.filter((key) => predicate(stageValue(stages, key)));
}

function hasAnyStarted(stages: TripAnalysisStageSnapshot): boolean {
  return TRIP_ANALYSIS_STAGE_KEYS.some((key) => stageValue(stages, key) !== 'not_started');
}

function hasUsablePartialResults(stages: TripAnalysisStageSnapshot): boolean {
  return isDone(stages.behavior);
}

function allRequiredSuccessful(stages: TripAnalysisStageSnapshot): boolean {
  return REQUIRED_FOR_COMPLETE.every((key) => isSuccessfulTerminal(stageValue(stages, key)));
}

function allStagesTerminal(stages: TripAnalysisStageSnapshot): boolean {
  return TRIP_ANALYSIS_STAGE_KEYS.every((key) => {
    const state = stageValue(stages, key);
    return isTerminal(state) || state === 'not_started';
  });
}

function allRequiredTerminal(stages: TripAnalysisStageSnapshot): boolean {
  return REQUIRED_FOR_COMPLETE.every((key) => isTerminal(stageValue(stages, key)));
}

function optionalStagesResolved(stages: TripAnalysisStageSnapshot): boolean {
  return OPTIONAL_STAGES.every((key) => {
    const state = stageValue(stages, key);
    return isTerminal(state) || state === 'not_started';
  });
}

function hasNonCriticalFailure(stages: TripAnalysisStageSnapshot): boolean {
  return listStagesWhere(stages, isFailed).some((key) => key !== 'behavior');
}

export function mirrorResolvedStatusToLegacy(
  status: ResolvedTripAnalysisStatus,
): TripAnalysisStatusResolverResult['legacyTripAnalysisStatus'] {
  switch (status) {
    case 'NOT_STARTED':
      return 'PENDING';
    case 'NOT_ASSESSABLE':
      return 'SKIPPED';
    default:
      return status;
  }
}

/**
 * Central trip analysis status resolver.
 * A single failed non-critical stage does not invalidate other successful stage outputs.
 */
export function resolveTripAnalysisStatus(
  input: TripAnalysisStatusResolverInput,
): TripAnalysisStatusResolverResult {
  const { stages, assessability } = input;
  const analysisQueued = input.analysisQueued ?? false;
  const pendingStages = listStagesWhere(stages, isPending);
  const failedStages = listStagesWhere(stages, isFailed);

  const base = (status: ResolvedTripAnalysisStatus): TripAnalysisStatusResolverResult => ({
    status,
    legacyTripAnalysisStatus: mirrorResolvedStatusToLegacy(status),
    hasUsablePartialResults: hasUsablePartialResults(stages),
    failedStages,
    pendingStages,
  });

  if (!analysisQueued && !hasAnyStarted(stages)) {
    return base('NOT_STARTED');
  }

  if (isFailed(stages.behavior)) {
    return base('FAILED');
  }

  const fullySkip = shouldFullySkipAnalysis(assessability);
  const behaviorCapabilitySkip =
    isCapabilityTerminal(stages.behavior) && !isDone(stages.behavior);

  if (
    (fullySkip || behaviorCapabilitySkip) &&
    !hasUsablePartialResults(stages) &&
    allRequiredTerminal(stages)
  ) {
    if (assessability.analysisAssessability === 'NOT_ASSESSABLE') {
      return base('NOT_ASSESSABLE');
    }
    return base('SKIPPED');
  }

  if (hasUsablePartialResults(stages) && (pendingStages.length > 0 || hasNonCriticalFailure(stages))) {
    return base('PARTIAL');
  }

  if (
    isDone(stages.behavior) &&
    allRequiredSuccessful(stages) &&
    optionalStagesResolved(stages) &&
    pendingStages.length === 0 &&
    !hasNonCriticalFailure(stages)
  ) {
    return base('COMPLETED');
  }

  if (hasUsablePartialResults(stages) && allRequiredTerminal(stages) && hasNonCriticalFailure(stages)) {
    return base('PARTIAL');
  }

  if (pendingStages.length > 0) {
    return base('IN_PROGRESS');
  }

  if (
    assessability.analysisAssessability === 'NOT_ASSESSABLE' &&
    !hasUsablePartialResults(stages) &&
    allStagesTerminal(stages)
  ) {
    return base('NOT_ASSESSABLE');
  }

  if (hasUsablePartialResults(stages)) {
    return base('PARTIAL');
  }

  return base('IN_PROGRESS');
}
