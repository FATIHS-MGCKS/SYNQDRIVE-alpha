import {
  clearPossibleEndClockFields,
  isValidProviderEventTimestamp,
} from './trip-fsm-clock-contract';

export type PecResumeCheckOutcome =
  | 'RESUMED'
  | 'NO_RESUME_EVIDENCE'
  | 'FETCH_ERROR';

/** Transient end-cycle keys stripped on reopen so they do not leak into the next cycle. */
export const END_CYCLE_TRANSIENT_EVIDENCE_KEYS = [
  'endValidationStartedAt',
  'endValidationScheduledAt',
  'endValidationCompletedAt',
  'completedEndValidationAttempt',
  'endCandidateClockSource',
  'noCoreStream',
  'noCoreEmptyCoreForensics',
  'emptyCoreDecision',
  'emptyCoreReason',
  'maxAttemptFallbackReason',
  'resumeCheckOutcome',
  'completedAttemptCount',
] as const;

export function stripEndCycleTransientEvidence(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...(summary ?? {}) };
  for (const key of END_CYCLE_TRANSIENT_EVIDENCE_KEYS) {
    delete base[key];
  }
  return base;
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
    lastEvidenceSummary: stripEndCycleTransientEvidence(params.priorSummary),
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
  workerNow: Date;
  completedAttempt: number;
  scheduledAt?: string | null;
}): Record<string, unknown> {
  const base = stripEndCycleTransientEvidence(params.priorSummary);
  return {
    ...base,
    ...(params.scheduledAt ? { endValidationScheduledAt: params.scheduledAt } : {}),
    endValidationStartedAt: params.workerNow.toISOString(),
    endValidationCompletedAt: params.workerNow.toISOString(),
    completedEndValidationAttempt: params.completedAttempt,
  };
}

export function buildMaxAttemptFallbackEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  completedAttemptCount: number;
  resumeCheckOutcome: PecResumeCheckOutcome;
}): Record<string, unknown> {
  return {
    ...stripEndCycleTransientEvidence(params.priorSummary),
    maxAttemptFallbackReason: 'max_completed_cusum_attempts',
    completedAttemptCount: params.completedAttemptCount,
    resumeCheckOutcome: params.resumeCheckOutcome,
  };
}
