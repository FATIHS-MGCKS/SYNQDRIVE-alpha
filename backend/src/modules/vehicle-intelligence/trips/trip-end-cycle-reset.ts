import {
  clearPossibleEndClockFields,
  isValidProviderEventTimestamp,
} from './trip-fsm-clock-contract';
import type { EmptyCoreForensics } from './trip-empty-core-end-gate';

export type PecResumeCheckOutcome =
  | 'RESUMED'
  | 'NO_RESUME_EVIDENCE'
  | 'FETCH_ERROR';

/** End-cycle keys stripped ONLY on POSSIBLE_END → ACTIVE reopen. */
export const END_CYCLE_REOPEN_STRIP_KEYS = [
  'endValidationStartedAt',
  'endValidationScheduledAt',
  'endValidationCompletedAt',
  'completedEndValidationAttempt',
  'endValidationFailureReason',
  'endValidationFailureOutcome',
  'endValidationFetchFailureReason',
  'endCandidateClockSource',
  'noCoreStream',
  'noCoreEmptyCoreForensics',
  'emptyCoreDecision',
  'emptyCoreReason',
  'maxAttemptFallbackReason',
  'resumeCheckOutcome',
  'completedAttemptCount',
] as const;

/** @deprecated use END_CYCLE_REOPEN_STRIP_KEYS */
export const END_CYCLE_TRANSIENT_EVIDENCE_KEYS = END_CYCLE_REOPEN_STRIP_KEYS;

export function stripEndCycleEvidenceForActiveReopen(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...(summary ?? {}) };
  for (const key of END_CYCLE_REOPEN_STRIP_KEYS) {
    delete base[key];
  }
  return base;
}

/** @deprecated use stripEndCycleEvidenceForActiveReopen */
export function stripEndCycleTransientEvidence(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return stripEndCycleEvidenceForActiveReopen(summary);
}

/** R1-safe acceptance of detector-derived movement EVENT_TIME. */
export function validateCusumMovementEventTime(
  raw: string | Date | null | undefined,
  workerNow: Date,
): Date | null {
  if (raw == null) return null;
  const candidate = raw instanceof Date ? raw : new Date(raw);
  if (!isValidProviderEventTimestamp(candidate, workerNow)) return null;
  return candidate;
}

/** Shared POSSIBLE_END → ACTIVE reset contract (PEC resume + CUSUM ongoing reopen). */
export function buildPossibleEndToActiveReset(params: {
  workerNow: Date;
  lastMeaningfulMovementAt?: Date | null;
  priorSummary?: Record<string, unknown> | null;
}) {
  const reset: Record<string, unknown> = {
    ...clearPossibleEndClockFields(),
    endDetectionMode: null,
    endConfidence: null,
    endValidationAttempts: 0,
    cusumValidatedAt: null,
    cusumSegmentStart: null,
    cusumSegmentEnd: null,
    lastActivityAt: params.workerNow,
    lastCoreProcessedAt: params.workerNow,
    lastEvidenceSummary: stripEndCycleEvidenceForActiveReopen(params.priorSummary),
  };
  if (params.lastMeaningfulMovementAt) {
    reset.lastMeaningfulMovementAt = params.lastMeaningfulMovementAt;
  }
  return reset;
}

export function buildEndValidationScheduledEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    endValidationScheduledAt: params.workerNow.toISOString(),
  };
}

export function buildEndValidationCompletionEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  validationStartedAt: Date;
  validationCompletedAt: Date;
  completedAttempt: number;
  scheduledAt?: string | null;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    ...(params.scheduledAt ? { endValidationScheduledAt: params.scheduledAt } : {}),
    endValidationStartedAt: params.validationStartedAt.toISOString(),
    endValidationCompletedAt: params.validationCompletedAt.toISOString(),
    completedEndValidationAttempt: params.completedAttempt,
  };
}

export function buildEndValidationFailureEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  validationStartedAt?: Date | null;
  failureReason: string;
  failureOutcome: 'DETECTOR_EXECUTION_FAILURE' | 'DETECTOR_MISSING';
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    ...(params.validationStartedAt
      ? { endValidationStartedAt: params.validationStartedAt.toISOString() }
      : {}),
    endValidationFailureReason: params.failureReason,
    endValidationFailureOutcome: params.failureOutcome,
  };
}

export function buildEndValidationFetchFailureEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  validationStartedAt?: Date | null;
  failureReason: string;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    ...(params.validationStartedAt
      ? { endValidationStartedAt: params.validationStartedAt.toISOString() }
      : {}),
    endValidationFetchFailureReason: params.failureReason,
  };
}

export function buildMaxAttemptFallbackEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  completedAttemptCount: number;
  resumeCheckOutcome: PecResumeCheckOutcome;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    maxAttemptFallbackReason: 'max_completed_cusum_attempts',
    completedAttemptCount: params.completedAttemptCount,
    resumeCheckOutcome: params.resumeCheckOutcome,
  };
}

export function extractR5EndForensicsForPersistence(
  summary: Record<string, unknown> | null | undefined,
): {
  endValidation: Record<string, unknown>;
  emptyCoreEndGate?: Record<string, unknown>;
} {
  const s = summary ?? {};
  const emptyCore = s.noCoreEmptyCoreForensics as EmptyCoreForensics | undefined;

  const endValidation: Record<string, unknown> = {};
  if (typeof s.endCandidateClockSource === 'string') {
    endValidation.endCandidateClockSource = s.endCandidateClockSource;
  }
  if (typeof s.endValidationScheduledAt === 'string') {
    endValidation.scheduledAt = s.endValidationScheduledAt;
  }
  if (typeof s.endValidationStartedAt === 'string') {
    endValidation.startedAt = s.endValidationStartedAt;
  }
  if (typeof s.endValidationCompletedAt === 'string') {
    endValidation.completedAt = s.endValidationCompletedAt;
  }
  if (typeof s.completedEndValidationAttempt === 'number') {
    endValidation.completedAttempt = s.completedEndValidationAttempt;
  }
  if (typeof s.completedAttemptCount === 'number') {
    endValidation.completedAttemptCount = s.completedAttemptCount;
  }
  if (typeof s.maxAttemptFallbackReason === 'string') {
    endValidation.maxAttemptFallbackReason = s.maxAttemptFallbackReason;
  }
  if (typeof s.resumeCheckOutcome === 'string') {
    endValidation.resumeCheckOutcome = s.resumeCheckOutcome;
  }

  let emptyCoreEndGate: Record<string, unknown> | undefined;
  if (emptyCore) {
    emptyCoreEndGate = {
      decision: emptyCore.decision,
      reason: emptyCore.reason,
      operationalInactiveMs: emptyCore.operationalInactiveMs,
      vlsEvidenceState: emptyCore.vlsEvidenceState,
      vlsProviderObservedAt: emptyCore.vlsProviderObservedAt,
      vlsObservationAgeMs: emptyCore.vlsObservationAgeMs,
      performanceActivity: emptyCore.performanceActivity,
      routeMotion: emptyCore.routeMotion,
    };
  }

  return {
    endValidation,
    ...(emptyCoreEndGate ? { emptyCoreEndGate } : {}),
  };
}
