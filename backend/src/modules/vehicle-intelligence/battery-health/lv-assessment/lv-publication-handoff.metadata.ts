import type { LvAssessmentTrack } from './lv-estimated-health-assessment.policy';

export const LV_PUBLICATION_HANDOFF_STATUS = {
  MISSING: 'MISSING',
  ENQUEUED: 'ENQUEUED',
  EXECUTED: 'EXECUTED',
} as const;

export type LvPublicationHandoffStatus =
  (typeof LV_PUBLICATION_HANDOFF_STATUS)[keyof typeof LV_PUBLICATION_HANDOFF_STATUS];

export const LV_PUBLICATION_HANDOFF_OUTCOME = {
  PUBLICATION_EVALUATED: 'PUBLICATION_EVALUATED',
  POLICY_SKIPPED: 'POLICY_SKIPPED',
  HANDOFF_SUPPRESSED: 'HANDOFF_SUPPRESSED',
} as const;

export type LvPublicationHandoffOutcome =
  (typeof LV_PUBLICATION_HANDOFF_OUTCOME)[keyof typeof LV_PUBLICATION_HANDOFF_OUTCOME];

export interface LvPublicationHandoffMetadata {
  status: LvPublicationHandoffStatus;
  selectedAssessmentId: string;
  assessmentTrack: LvAssessmentTrack;
  idempotencyKey: string;
  publicationVersion: number;
  epochAssessmentIds: string[];
  enqueuedAt?: string;
  executedAt?: string;
  lastAttemptAt?: string;
  bullJobId?: string | null;
  outcome?: LvPublicationHandoffOutcome;
}

const HANDOFF_STATUS_RANK: Record<LvPublicationHandoffStatus, number> = {
  MISSING: 0,
  ENQUEUED: 1,
  EXECUTED: 2,
};

export function publicationHandoffStatusRank(
  status: LvPublicationHandoffStatus | undefined | null,
): number {
  if (!status) return HANDOFF_STATUS_RANK.MISSING;
  return HANDOFF_STATUS_RANK[status] ?? HANDOFF_STATUS_RANK.MISSING;
}

/** Monotonic merge — never regress EXECUTED → ENQUEUED/MISSING. */
export function mergePublicationHandoffState(
  existing: LvPublicationHandoffMetadata | null | undefined,
  patch: Partial<LvPublicationHandoffMetadata> &
    Pick<
      LvPublicationHandoffMetadata,
      | 'selectedAssessmentId'
      | 'assessmentTrack'
      | 'idempotencyKey'
      | 'publicationVersion'
      | 'epochAssessmentIds'
    > & {
      status?: LvPublicationHandoffStatus;
    },
): LvPublicationHandoffMetadata {
  const base: LvPublicationHandoffMetadata = existing ?? {
    status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
    selectedAssessmentId: patch.selectedAssessmentId,
    assessmentTrack: patch.assessmentTrack,
    idempotencyKey: patch.idempotencyKey,
    publicationVersion: patch.publicationVersion,
    epochAssessmentIds: patch.epochAssessmentIds,
  };

  const nextStatus = patch.status ?? base.status;
  if (publicationHandoffStatusRank(nextStatus) < publicationHandoffStatusRank(base.status)) {
    return {
      ...base,
      lastAttemptAt: patch.lastAttemptAt ?? base.lastAttemptAt,
      bullJobId: patch.bullJobId ?? base.bullJobId,
      outcome: patch.outcome ?? base.outcome,
      executedAt: patch.executedAt ?? base.executedAt,
      enqueuedAt: patch.enqueuedAt ?? base.enqueuedAt,
    };
  }

  return {
    ...base,
    ...patch,
    selectedAssessmentId: patch.selectedAssessmentId,
    assessmentTrack: patch.assessmentTrack,
    idempotencyKey: patch.idempotencyKey,
    publicationVersion: patch.publicationVersion,
    epochAssessmentIds: patch.epochAssessmentIds,
    status: nextStatus,
    outcome: patch.outcome !== undefined ? patch.outcome : base.outcome,
  };
}

export function readPublicationHandoffFromAssessmentSummary(
  inputSummary: unknown,
): LvPublicationHandoffMetadata | null {
  if (!inputSummary || typeof inputSummary !== 'object' || Array.isArray(inputSummary)) {
    return null;
  }
  const raw = (inputSummary as Record<string, unknown>).publicationHandoff;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const status = data.status;
  const selectedAssessmentId = data.selectedAssessmentId;
  const assessmentTrack = data.assessmentTrack;
  const idempotencyKey = data.idempotencyKey;
  const publicationVersion = data.publicationVersion;
  const epochAssessmentIds = data.epochAssessmentIds;

  if (
    status !== LV_PUBLICATION_HANDOFF_STATUS.MISSING &&
    status !== LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED &&
    status !== LV_PUBLICATION_HANDOFF_STATUS.EXECUTED
  ) {
    return null;
  }
  if (typeof selectedAssessmentId !== 'string' || !selectedAssessmentId) {
    return null;
  }
  if (assessmentTrack !== 'TELEMETRY' && assessmentTrack !== 'WORKSHOP_OVERRIDE') {
    return null;
  }
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
    return null;
  }
  if (typeof publicationVersion !== 'number' || !Number.isInteger(publicationVersion)) {
    return null;
  }
  if (!Array.isArray(epochAssessmentIds)) {
    return null;
  }

  return {
    status,
    selectedAssessmentId,
    assessmentTrack,
    idempotencyKey,
    publicationVersion,
    epochAssessmentIds: epochAssessmentIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ),
    enqueuedAt: typeof data.enqueuedAt === 'string' ? data.enqueuedAt : undefined,
    executedAt: typeof data.executedAt === 'string' ? data.executedAt : undefined,
    lastAttemptAt:
      typeof data.lastAttemptAt === 'string' ? data.lastAttemptAt : undefined,
    bullJobId:
      data.bullJobId === null || typeof data.bullJobId === 'string'
        ? data.bullJobId
        : undefined,
    outcome:
      data.outcome === LV_PUBLICATION_HANDOFF_OUTCOME.PUBLICATION_EVALUATED ||
      data.outcome === LV_PUBLICATION_HANDOFF_OUTCOME.POLICY_SKIPPED ||
      data.outcome === LV_PUBLICATION_HANDOFF_OUTCOME.HANDOFF_SUPPRESSED
        ? data.outcome
        : undefined,
  };
}

export function mergePublicationHandoffIntoAssessmentSummary(
  inputSummary: Record<string, unknown> | null | undefined,
  handoff: Partial<LvPublicationHandoffMetadata> &
    Pick<
      LvPublicationHandoffMetadata,
      | 'selectedAssessmentId'
      | 'assessmentTrack'
      | 'idempotencyKey'
      | 'publicationVersion'
      | 'epochAssessmentIds'
    > & {
      status?: LvPublicationHandoffStatus;
    },
): Record<string, unknown> {
  const base =
    inputSummary && typeof inputSummary === 'object' && !Array.isArray(inputSummary)
      ? { ...inputSummary }
      : {};
  const existing = readPublicationHandoffFromAssessmentSummary(base);
  const merged = mergePublicationHandoffState(existing, handoff);

  return {
    ...base,
    publicationHandoff: merged,
  };
}
