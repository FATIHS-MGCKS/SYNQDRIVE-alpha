import {
  clearPossibleEndClockFields,
  isValidProviderEventTimestamp,
  readPossibleEndEnteredAtFromEvidence,
  type StopBoundaryProvenance,
} from './trip-fsm-clock-contract';
import type { EmptyCoreForensics } from './trip-empty-core-end-gate';
import {
  readLastProviderActivityAt,
  readProviderSilenceCandidateProvenance,
  readStopBoundaryProvenance,
  type ProviderSilenceCandidateProvenance,
} from './trip-fsm-evidence-state';
import { parseStrictEvidenceTimestamp } from './trip-fsm-forensics.util';

/** Why POSSIBLE_END → ACTIVE reopen occurred — controls stop-boundary strip semantics. */
export type ActiveReopenReason = 'ACTIVITY_RESUMED' | 'CUSUM_STILL_ONGOING';

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
  'innerGateReason',
  'stopBoundaryAt',
  'stopBoundarySource',
  'pauseDetectedAt',
  'pauseDetectedSource',
  'lastProviderActivityAt',
  'emptyCoreDeferralStreak',
  'emptyCoreNextCheckDelayMs',
  'maxAttemptFallbackReason',
  'resumeCheckOutcome',
  'completedAttemptCount',
  'pendingFinalizeCycleToken',
  'pendingFinalizeScheduledAt',
  'chSkipResumeRevalidationDeferCount',
  'chSkipResumeRevalidationLastDeferredAt',
  'chSkipResumeRevalidationRelatchEnteredAt',
  'clickhouseEndAssistRelatchEmptyCore',
] as const;

/** Bounded post-boundary resume revalidation outcomes for CH skip terminal path. */
export type ChSkipResumeRevalidationOutcome =
  | 'RESUME_CONFIRMED'
  | 'NO_RESUME_EVIDENCE_MATURE'
  | 'NO_RESUME_EVIDENCE_IMMATURE'
  | 'FETCH_UNCERTAIN'
  /** Resume fetch still uncertain or defer budget exhausted — existing CUSUM path owns next decision. */
  | 'HANDOFF_TO_CUSUM_VALIDATION';

export type ChSkipResumeRevalidationHandoffReason =
  | 'fetch_uncertain_after_immaturity_bound'
  | 'defer_budget_exhausted';

/**
 * Immaturity bound for CH skip resume revalidation — reuses existing end-cycle clocks:
 * TRIP_END_VALIDATION_RETRY_MS + TRIP_END_CH_ASSIST_STABILITY_MS.
 */
export function resolveChSkipResumeRevalidationImmaturityBoundMs(params: {
  validationRetryMs: number;
  chAssistStabilityMs: number;
}): number {
  return params.validationRetryMs + params.chAssistStabilityMs;
}

export function readChSkipResumeRevalidationDeferCount(
  summary: Record<string, unknown> | null | undefined,
): number {
  const raw = summary?.chSkipResumeRevalidationDeferCount;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/** Anchor immaturity dwell on CH empty-core re-latch, not an earlier POSSIBLE_END episode. */
export function resolveChSkipResumeRevalidationRelatchEnteredAt(params: {
  detPossibleEndEnteredAt?: Date | null;
  priorSummary?: Record<string, unknown> | null;
  fallbackNow: Date;
  endDetectionMode?: string | null;
}): Date {
  const summary = params.priorSummary ?? {};
  const relatchEvidenceAt = parseStrictEvidenceTimestamp(
    summary.chSkipResumeRevalidationRelatchEnteredAt,
  );
  if (relatchEvidenceAt) {
    return relatchEvidenceAt;
  }
  if (
    params.endDetectionMode === 'CLICKHOUSE_END_ASSIST' &&
    params.detPossibleEndEnteredAt
  ) {
    return params.detPossibleEndEnteredAt;
  }
  if (
    summary.clickhouseEndAssistRelatchEmptyCore === true &&
    params.detPossibleEndEnteredAt
  ) {
    return params.detPossibleEndEnteredAt;
  }
  const fromEvidence = readPossibleEndEnteredAtFromEvidence(summary);
  if (fromEvidence && summary.clickhouseEndAssistRelatchEmptyCore !== true) {
    return fromEvidence;
  }
  return params.detPossibleEndEnteredAt ?? params.fallbackNow;
}

export function resolveChSkipResumeRevalidationMaxDeferCount(
  validationMaxAttempts: number,
): number {
  return Math.max(0, validationMaxAttempts - 1);
}

/**
 * Pure maturity gate — distinguishes "no movement yet" from "safe to terminalize".
 * Defer budget and immaturity bound are both enforced; persistent fetch uncertainty
 * hands off to existing CUSUM validation rather than looping forever.
 */
export function evaluateChSkipResumeRevalidationMaturity(params: {
  nowMs: number;
  relatchEnteredAtMs: number;
  immaturityBoundMs: number;
  resumeObserved: boolean;
  fetchUncertain: boolean;
  priorDeferCount: number;
  maxDeferCount: number;
}): ChSkipResumeRevalidationOutcome {
  if (params.resumeObserved) {
    return 'RESUME_CONFIRMED';
  }
  const dwellMs = params.nowMs - params.relatchEnteredAtMs;
  const immaturityElapsed = dwellMs >= params.immaturityBoundMs;
  const deferBudgetExhausted =
    params.maxDeferCount > 0 && params.priorDeferCount >= params.maxDeferCount;

  if (deferBudgetExhausted || (params.fetchUncertain && immaturityElapsed)) {
    return 'HANDOFF_TO_CUSUM_VALIDATION';
  }
  if (!immaturityElapsed) {
    return params.fetchUncertain
      ? 'FETCH_UNCERTAIN'
      : 'NO_RESUME_EVIDENCE_IMMATURE';
  }
  return 'NO_RESUME_EVIDENCE_MATURE';
}

export function resolveChSkipResumeRevalidationHandoffReason(params: {
  fetchUncertain: boolean;
  immaturityElapsed: boolean;
  deferBudgetExhausted: boolean;
}): ChSkipResumeRevalidationHandoffReason {
  if (params.deferBudgetExhausted && !params.immaturityElapsed) {
    return 'defer_budget_exhausted';
  }
  if (params.deferBudgetExhausted) {
    return 'defer_budget_exhausted';
  }
  return 'fetch_uncertain_after_immaturity_bound';
}

export function buildChSkipResumeRevalidationHandoffEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
  candidateEndAt: Date;
  relatchEnteredAt: Date;
  handoffReason: ChSkipResumeRevalidationHandoffReason;
  priorDeferCount: number;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    chSkipResumeRevalidationOutcome: 'HANDOFF_TO_CUSUM_VALIDATION',
    chSkipResumeRevalidationHandoffAt: params.workerNow.toISOString(),
    chSkipResumeRevalidationHandoffReason: params.handoffReason,
    chSkipResumeRevalidationCandidateEndAt: params.candidateEndAt.toISOString(),
    chSkipResumeRevalidationRelatchEnteredAt: params.relatchEnteredAt.toISOString(),
    chSkipResumeRevalidationDeferCount: params.priorDeferCount,
  };
}

export function buildChSkipResumeRevalidationDeferredEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
  deferCount: number;
  relatchEnteredAt: Date;
  candidateEndAt: Date;
  immaturityBoundMs: number;
  outcome: Extract<
    ChSkipResumeRevalidationOutcome,
    'NO_RESUME_EVIDENCE_IMMATURE' | 'FETCH_UNCERTAIN'
  >;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    chSkipResumeRevalidationDeferCount: params.deferCount,
    chSkipResumeRevalidationLastDeferredAt: params.workerNow.toISOString(),
    chSkipResumeRevalidationCandidateEndAt: params.candidateEndAt.toISOString(),
    chSkipResumeRevalidationRelatchEnteredAt: params.relatchEnteredAt.toISOString(),
    chSkipResumeRevalidationImmaturityBoundMs: params.immaturityBoundMs,
    chSkipResumeRevalidationOutcome: params.outcome,
  };
}

/**
 * Stop-boundary evidence restored ONLY on CUSUM_STILL_ONGOING reopen when the prior
 * boundary is trusted and not invalidated by post-boundary movement.
 */
export const CUSUM_RETRY_PRESERVE_STOP_BOUNDARY_KEYS = [
  'stopBoundaryAt',
  'stopBoundarySource',
  'stopBoundaryClockAuthority',
  'stopBoundaryTrust',
  'stopBoundaryEvidenceState',
  'stopBoundaryCandidateReason',
  'stopBoundaryContradictions',
] as const;

/** Same provider-silence end episode — low-trust candidate, not a physical stop boundary. */
export const CUSUM_RETRY_PRESERVE_PROVIDER_SILENCE_KEYS = [
  'providerSilenceCandidateAt',
  'providerSilenceCandidateSource',
  'providerSilenceCandidateClockAuthority',
  'providerSilenceCandidateTrust',
  'providerSilenceAdmissionEligible',
] as const;

/** Stable token for one POSSIBLE_END episode (worker-entered clock). */
export function resolveEndCycleToken(det: {
  possibleEndEnteredAt?: Date | null;
  lastEvidenceSummary?: unknown;
}): string | null {
  if (det.possibleEndEnteredAt) {
    return det.possibleEndEnteredAt.toISOString();
  }
  const fromEvidence = readPossibleEndEnteredAtFromEvidence(det.lastEvidenceSummary);
  return fromEvidence?.toISOString() ?? null;
}

export function resolvePendingFinalizeCycleToken(
  summary: Record<string, unknown> | null | undefined,
): string | null {
  const token = summary?.pendingFinalizeCycleToken;
  return typeof token === 'string' ? token : null;
}

export type EndCycleTokenStaleOutcome =
  | 'ok'
  | 'stale_active_trip'
  | 'stale_token_mismatch'
  | 'stale_cycle_cleared'
  | 'stale_legacy_requested_before_cycle'
  | 'stale_legacy_missing_correlation';

export function evaluateEndCycleJobAdmission(params: {
  det: {
    state: string;
    possibleEndEnteredAt?: Date | null;
    lastEvidenceSummary?: unknown;
  };
  job: { endCycleToken?: string; requestedAt?: string };
}): EndCycleTokenStaleOutcome {
  const summary = params.det.lastEvidenceSummary as Record<string, unknown> | null;
  return isEndCycleTokenStale({
    jobToken: params.job.endCycleToken,
    expectedToken: resolveEndCycleToken(params.det),
    fsmState: params.det.state,
    jobRequestedAt: params.job.requestedAt,
    pendingFinalizeCycleToken: resolvePendingFinalizeCycleToken(summary),
  });
}

export function buildPendingFinalizeScheduledEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  endCycleToken: string;
  workerNow: Date;
}): Record<string, unknown> {
  return {
    ...(params.priorSummary ?? {}),
    pendingFinalizeCycleToken: params.endCycleToken,
    pendingFinalizeScheduledAt: params.workerNow.toISOString(),
  };
}

/**
 * R10 legacy compatibility: tokenless FINALIZE jobs must not commit against a
 * later POSSIBLE_END episode. Uses job.requestedAt vs possibleEndEnteredAt and
 * optional pendingFinalizeCycleToken evidence — never assigns the current token
 * to a tokenless job.
 */
export function isEndCycleTokenStale(params: {
  jobToken?: string | null;
  expectedToken: string | null;
  fsmState: string;
  jobRequestedAt?: string | null;
  pendingFinalizeCycleToken?: string | null;
}): EndCycleTokenStaleOutcome {
  if (params.fsmState === 'ACTIVE_TRIP') return 'stale_active_trip';

  if (params.jobToken) {
    if (!params.expectedToken) return 'stale_cycle_cleared';
    if (params.jobToken !== params.expectedToken) return 'stale_token_mismatch';
    return 'ok';
  }

  if (!params.expectedToken) {
    if (params.fsmState !== 'POSSIBLE_END') return 'stale_cycle_cleared';
    return 'ok';
  }

  const expectedMs = Date.parse(params.expectedToken);
  if (!Number.isFinite(expectedMs)) return 'stale_cycle_cleared';

  if (
    params.pendingFinalizeCycleToken != null &&
    params.pendingFinalizeCycleToken !== params.expectedToken
  ) {
    return 'stale_token_mismatch';
  }

  if (params.jobRequestedAt) {
    const requestedMs = Date.parse(params.jobRequestedAt);
    if (Number.isFinite(requestedMs) && requestedMs < expectedMs) {
      return 'stale_legacy_requested_before_cycle';
    }
    return 'ok';
  }

  return 'stale_legacy_missing_correlation';
}

export function mapEndCycleStaleFinalizeReason(
  outcome: EndCycleTokenStaleOutcome,
): string {
  switch (outcome) {
    case 'stale_active_trip':
      return 'stale_finalize_aborted_active_trip';
    case 'stale_token_mismatch':
      return 'stale_finalize_aborted_end_cycle_mismatch';
    case 'stale_cycle_cleared':
      return 'stale_finalize_aborted_end_cycle_cleared';
    case 'stale_legacy_requested_before_cycle':
      return 'stale_finalize_aborted_legacy_before_cycle';
    case 'stale_legacy_missing_correlation':
      return 'stale_finalize_aborted_legacy_ambiguous';
    default:
      return 'stale_finalize_aborted_end_cycle_mismatch';
  }
}

/** Attempt-local runtime fields cleared between validation attempts within the same end episode. */
export const END_VALIDATION_ATTEMPT_LOCAL_KEYS = [
  'endValidationScheduledAt',
  'endValidationStartedAt',
  'endValidationCompletedAt',
  'endValidationFailureReason',
  'endValidationFailureOutcome',
  'endValidationFetchFailureReason',
  'completedEndValidationAttempt',
] as const;

export function clearEndValidationAttemptLocalEvidence(
  summary: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...(summary ?? {}) };
  for (const key of END_VALIDATION_ATTEMPT_LOCAL_KEYS) {
    delete base[key];
  }
  return base;
}

function withClearedAttemptLocalState(
  summary: Record<string, unknown> | null | undefined,
  options?: { preserveScheduledAt?: boolean },
): Record<string, unknown> {
  const scheduledAt =
    options?.preserveScheduledAt &&
    typeof summary?.endValidationScheduledAt === 'string'
      ? summary.endValidationScheduledAt
      : undefined;
  const cleared = clearEndValidationAttemptLocalEvidence(summary);
  if (scheduledAt) {
    cleared.endValidationScheduledAt = scheduledAt;
  }
  return cleared;
}

/** @deprecated use END_CYCLE_REOPEN_STRIP_KEYS */
export const END_CYCLE_TRANSIENT_EVIDENCE_KEYS = END_CYCLE_REOPEN_STRIP_KEYS;

/**
 * Trusted stop boundary eligible for CUSUM-only ACTIVE reopen preservation.
 * Does not invent boundaries — reads existing provenance only.
 */
export function resolveTrustedStopBoundaryForCusumRetry(
  summary: Record<string, unknown> | null | undefined,
  workerNow: Date,
  lastMeaningfulMovementAt?: Date | null,
): StopBoundaryProvenance | null {
  const provenance = readStopBoundaryProvenance(summary);
  if (!provenance?.trust) return null;
  if (!isValidProviderEventTimestamp(provenance.boundaryAt, workerNow)) return null;
  if (
    lastMeaningfulMovementAt &&
    isValidProviderEventTimestamp(lastMeaningfulMovementAt, workerNow) &&
    lastMeaningfulMovementAt.getTime() > provenance.boundaryAt.getTime()
  ) {
    return null;
  }
  return provenance;
}

/**
 * Low-trust provider-silence end candidate eligible for CUSUM-only retry continuity.
 * Does not promote to trusted stop boundary semantics.
 */
export function resolveProviderSilenceCandidateForCusumRetry(
  summary: Record<string, unknown> | null | undefined,
  workerNow: Date,
  lastMeaningfulMovementAt?: Date | null,
): ProviderSilenceCandidateProvenance | null {
  const provenance = readProviderSilenceCandidateProvenance(summary, workerNow);
  if (!provenance) return null;
  if (
    lastMeaningfulMovementAt &&
    isValidProviderEventTimestamp(lastMeaningfulMovementAt, workerNow) &&
    lastMeaningfulMovementAt.getTime() > provenance.anchorAt.getTime()
  ) {
    return null;
  }
  return provenance;
}

function copyCusumRetryProviderSilenceFields(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  for (const key of CUSUM_RETRY_PRESERVE_PROVIDER_SILENCE_KEYS) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  const priorActivity = readLastProviderActivityAt(source);
  if (priorActivity) {
    target.lastProviderActivityAt = priorActivity.toISOString();
  }
}

function hasMatchingProviderSilenceCandidate(
  preserved: ProviderSilenceCandidateProvenance,
  candidate: ProviderSilenceCandidateProvenance | null | undefined,
): boolean {
  if (!candidate) return false;
  return (
    preserved.anchorAt.getTime() === candidate.anchorAt.getTime() &&
    preserved.source === candidate.source &&
    preserved.clockAuthority === candidate.clockAuthority &&
    preserved.trust === candidate.trust
  );
}

function resolveCusumRetryBudgetContinuity(params: {
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
  lastMeaningfulMovementAt?: Date | null;
}): {
  trustedBoundary: StopBoundaryProvenance | null;
  providerSilence: ProviderSilenceCandidateProvenance | null;
} {
  return {
    trustedBoundary: resolveTrustedStopBoundaryForCusumRetry(
      params.priorSummary,
      params.workerNow,
      params.lastMeaningfulMovementAt,
    ),
    providerSilence: resolveProviderSilenceCandidateForCusumRetry(
      params.priorSummary,
      params.workerNow,
      params.lastMeaningfulMovementAt,
    ),
  };
}

/**
 * Preserve completed END_VALIDATION budget when ACTIVE_TRIP re-enters POSSIBLE_END
 * for the same trusted stop episode OR same provider-silence end candidate.
 * New episodes still start at 0.
 */
export function resolveEndValidationAttemptsOnPossibleEndReentry(params: {
  priorState: string;
  endValidationAttempts?: number | null;
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
  lastMeaningfulMovementAt?: Date | null;
  candidateStopBoundary?: StopBoundaryProvenance | null;
  candidateProviderSilence?: ProviderSilenceCandidateProvenance | null;
}): number {
  const priorAttempts = params.endValidationAttempts ?? 0;
  if (priorAttempts <= 0) return 0;
  if (params.priorState !== 'ACTIVE_TRIP') return 0;

  const continuity = resolveCusumRetryBudgetContinuity({
    priorSummary: params.priorSummary,
    workerNow: params.workerNow,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
  });

  if (continuity.trustedBoundary) {
    if (
      params.candidateStopBoundary &&
      continuity.trustedBoundary.boundaryAt.getTime() !==
        params.candidateStopBoundary.boundaryAt.getTime()
    ) {
      return 0;
    }
    return priorAttempts;
  }

  if (continuity.providerSilence) {
    if (
      !hasMatchingProviderSilenceCandidate(
        continuity.providerSilence,
        params.candidateProviderSilence,
      )
    ) {
      return 0;
    }
    return priorAttempts;
  }

  return 0;
}

function copyCusumRetryStopBoundaryFields(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  for (const key of CUSUM_RETRY_PRESERVE_STOP_BOUNDARY_KEYS) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

export function stripEndCycleEvidenceForActiveReopen(
  summary: Record<string, unknown> | null | undefined,
  options?: {
    reopenReason?: ActiveReopenReason;
    workerNow?: Date;
    lastMeaningfulMovementAt?: Date | null;
  },
): Record<string, unknown> {
  const prior = summary ?? {};
  const base = { ...prior };
  for (const key of END_CYCLE_REOPEN_STRIP_KEYS) {
    delete base[key];
  }
  if (options?.reopenReason === 'CUSUM_STILL_ONGOING' && options.workerNow) {
    const continuity = resolveCusumRetryBudgetContinuity({
      priorSummary: prior,
      workerNow: options.workerNow,
      lastMeaningfulMovementAt: options.lastMeaningfulMovementAt,
    });
    if (continuity.trustedBoundary) {
      copyCusumRetryStopBoundaryFields(prior, base);
    } else if (continuity.providerSilence) {
      copyCusumRetryProviderSilenceFields(prior, base);
    }
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
  reopenReason?: ActiveReopenReason;
  /** Completed END_VALIDATION count for this stop episode — preserved only on CUSUM_STILL_ONGOING when trusted boundary remains valid. */
  completedEndValidationAttempts?: number;
}) {
  const reopenReason = params.reopenReason ?? 'ACTIVITY_RESUMED';
  let endValidationAttempts = 0;
  if (
    reopenReason === 'CUSUM_STILL_ONGOING' &&
    typeof params.completedEndValidationAttempts === 'number' &&
    params.completedEndValidationAttempts >= 0
  ) {
    const continuity = resolveCusumRetryBudgetContinuity({
      priorSummary: params.priorSummary,
      workerNow: params.workerNow,
      lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    });
    if (continuity.trustedBoundary || continuity.providerSilence) {
      endValidationAttempts = params.completedEndValidationAttempts;
    }
  }
  const reset: Record<string, unknown> = {
    ...clearPossibleEndClockFields(),
    endDetectionMode: null,
    endConfidence: null,
    endValidationAttempts,
    cusumValidatedAt: null,
    cusumSegmentStart: null,
    cusumSegmentEnd: null,
    lastActivityAt: params.workerNow,
    lastCoreProcessedAt: params.workerNow,
    lastEvidenceSummary: stripEndCycleEvidenceForActiveReopen(params.priorSummary, {
      reopenReason,
      workerNow: params.workerNow,
      lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    }),
  };
  if (params.lastMeaningfulMovementAt) {
    reset.lastMeaningfulMovementAt = params.lastMeaningfulMovementAt;
  }
  return reset;
}

export function buildEndValidationScheduledEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  workerNow: Date;
  possibleEndEnteredAt?: Date | null;
}): Record<string, unknown> {
  return {
    ...clearEndValidationAttemptLocalEvidence(params.priorSummary),
    endValidationScheduledAt: params.workerNow.toISOString(),
    ...(params.possibleEndEnteredAt
      ? { possibleEndEnteredAt: params.possibleEndEnteredAt.toISOString() }
      : {}),
  };
}

export function buildEndValidationStartedEvidence(params: {
  priorSummary?: Record<string, unknown> | null;
  validationStartedAt: Date;
}): Record<string, unknown> {
  return {
    ...withClearedAttemptLocalState(params.priorSummary, { preserveScheduledAt: true }),
    endValidationStartedAt: params.validationStartedAt.toISOString(),
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
    ...withClearedAttemptLocalState(params.priorSummary, { preserveScheduledAt: true }),
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
    ...withClearedAttemptLocalState(params.priorSummary, { preserveScheduledAt: true }),
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
    ...withClearedAttemptLocalState(params.priorSummary, { preserveScheduledAt: true }),
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
  completedAttemptCount?: number,
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
  if (typeof completedAttemptCount === 'number') {
    endValidation.completedAttemptCount = completedAttemptCount;
  } else if (typeof s.completedAttemptCount === 'number') {
    endValidation.completedAttemptCount = s.completedAttemptCount;
  }
  if (typeof s.endValidationFailureOutcome === 'string') {
    endValidation.failureOutcome = s.endValidationFailureOutcome;
  }
  if (typeof s.endValidationFailureReason === 'string') {
    endValidation.failureReason = s.endValidationFailureReason;
  }
  if (typeof s.endValidationFetchFailureReason === 'string') {
    endValidation.fetchFailureReason = s.endValidationFetchFailureReason;
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
