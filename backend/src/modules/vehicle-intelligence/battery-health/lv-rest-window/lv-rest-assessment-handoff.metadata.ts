import type { Prisma } from '@prisma/client';
import {
  LV_REST_TARGET_TYPES,
  mergeLvRestTargetJobMetadata,
  readLvRestWindowSessionMetadata,
  type LvRestTargetType,
} from './lv-rest-window-target.metadata';

export const LV_REST_ASSESSMENT_HANDOFF_STATUS = {
  MISSING: 'MISSING',
  ENQUEUED: 'ENQUEUED',
  EXECUTED: 'EXECUTED',
} as const;

export type LvRestAssessmentHandoffStatus =
  (typeof LV_REST_ASSESSMENT_HANDOFF_STATUS)[keyof typeof LV_REST_ASSESSMENT_HANDOFF_STATUS];

export const LV_REST_ASSESSMENT_HANDOFF_OUTCOME = {
  ASSESSMENT_PERSISTED: 'ASSESSMENT_PERSISTED',
  POLICY_SKIPPED: 'POLICY_SKIPPED',
  UNSUPPORTED: 'UNSUPPORTED',
} as const;

export type LvRestAssessmentHandoffOutcome =
  (typeof LV_REST_ASSESSMENT_HANDOFF_OUTCOME)[keyof typeof LV_REST_ASSESSMENT_HANDOFF_OUTCOME];

export interface LvRestAssessmentHandoffMetadata {
  measurementId: string;
  idempotencyKey: string;
  status: LvRestAssessmentHandoffStatus;
  outcome?: LvRestAssessmentHandoffOutcome | null;
  enqueuedAt?: string | null;
  executedAt?: string | null;
  lastAttemptAt?: string | null;
  bullJobId?: string | null;
}

const HANDOFF_STATUS_RANK: Record<LvRestAssessmentHandoffStatus, number> = {
  MISSING: 0,
  ENQUEUED: 1,
  EXECUTED: 2,
};

export function handoffStatusRank(
  status: LvRestAssessmentHandoffStatus | undefined | null,
): number {
  if (!status) return HANDOFF_STATUS_RANK.MISSING;
  return HANDOFF_STATUS_RANK[status] ?? HANDOFF_STATUS_RANK.MISSING;
}

/** Monotonic merge — never regress EXECUTED → ENQUEUED/MISSING. */
export function mergeAssessmentHandoffState(
  existing: LvRestAssessmentHandoffMetadata | null | undefined,
  patch: Partial<LvRestAssessmentHandoffMetadata> & {
    measurementId: string;
    idempotencyKey: string;
  },
): LvRestAssessmentHandoffMetadata {
  const base: LvRestAssessmentHandoffMetadata = existing ?? {
    measurementId: patch.measurementId,
    idempotencyKey: patch.idempotencyKey,
    status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
    outcome: null,
    enqueuedAt: null,
    executedAt: null,
    lastAttemptAt: null,
    bullJobId: null,
  };

  const nextStatus = patch.status ?? base.status;
  if (handoffStatusRank(nextStatus) < handoffStatusRank(base.status)) {
    return {
      ...base,
      lastAttemptAt: patch.lastAttemptAt ?? base.lastAttemptAt,
      bullJobId: patch.bullJobId ?? base.bullJobId,
    };
  }

  return {
    ...base,
    ...patch,
    measurementId: patch.measurementId,
    idempotencyKey: patch.idempotencyKey,
    status: nextStatus,
    outcome: patch.outcome !== undefined ? patch.outcome : base.outcome,
  };
}

export function readAssessmentHandoffFromTargetMetadata(
  metadata: unknown,
  targetType: LvRestTargetType,
): LvRestAssessmentHandoffMetadata | null {
  const entry =
    readLvRestWindowSessionMetadata(metadata).scheduledTargets?.[targetType];
  const handoff = (entry as { assessmentHandoff?: LvRestAssessmentHandoffMetadata } | undefined)
    ?.assessmentHandoff;
  if (!handoff?.measurementId || !handoff.idempotencyKey) return null;
  return handoff;
}

export function mergeSessionAssessmentHandoffMetadata(
  metadata: unknown,
  targetType: LvRestTargetType,
  handoffPatch: Partial<LvRestAssessmentHandoffMetadata> & {
    measurementId: string;
    idempotencyKey: string;
  },
): Prisma.InputJsonValue {
  const existing = readAssessmentHandoffFromTargetMetadata(metadata, targetType);
  const merged = mergeAssessmentHandoffState(existing, handoffPatch);
  const current = readLvRestWindowSessionMetadata(metadata);
  const scheduledTargets = { ...(current.scheduledTargets ?? {}) };
  const targetEntry = scheduledTargets[targetType] ?? {
    idempotencyKey: '',
    scheduledFor: new Date().toISOString(),
    status: 'COMPLETED' as const,
  };

  scheduledTargets[targetType] = {
    ...targetEntry,
    assessmentHandoff: merged,
  };

  return mergeLvRestTargetJobMetadata(
    { ...current, scheduledTargets },
    targetType,
    scheduledTargets[targetType]!,
  );
}

export function isLvRestTargetType(
  value: string,
): value is typeof LV_REST_TARGET_TYPES.REST_60M | typeof LV_REST_TARGET_TYPES.REST_6H {
  return value === LV_REST_TARGET_TYPES.REST_60M || value === LV_REST_TARGET_TYPES.REST_6H;
}
