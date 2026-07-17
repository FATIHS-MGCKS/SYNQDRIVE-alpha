import type { Prisma } from '@prisma/client';

export const LV_REST_TARGET_TYPES = {
  REST_60M: 'REST_60M',
  REST_6H: 'REST_6H',
} as const;

export type LvRestTargetType =
  (typeof LV_REST_TARGET_TYPES)[keyof typeof LV_REST_TARGET_TYPES];

export const LV_REST_TARGET_JOB_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ENQUEUED: 'ENQUEUED',
  RUNNING: 'RUNNING',
  PENDING_EVALUATION: 'PENDING_EVALUATION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
  MISSED: 'MISSED',
} as const;

export type LvRestTargetJobStatus =
  (typeof LV_REST_TARGET_JOB_STATUS)[keyof typeof LV_REST_TARGET_JOB_STATUS];

export interface LvRestTargetJobMetadata {
  idempotencyKey: string;
  scheduledFor: string;
  enqueuedAt?: string | null;
  bullJobId?: string | null;
  status: LvRestTargetJobStatus;
  lastAttemptAt?: string | null;
  completedAt?: string | null;
  cancelReason?: string | null;
}

export interface LvRestWindowScheduledTargets {
  REST_60M?: LvRestTargetJobMetadata;
  REST_6H?: LvRestTargetJobMetadata;
}

export interface LvRestWindowSessionMetadata {
  lvRestWindowState?: string;
  anchorAt?: string;
  lastTransitionAt?: string;
  confirmedRestingAt?: string | null;
  invalidatedReason?: string | null;
  lastEventType?: string | null;
  scheduledTargets?: LvRestWindowScheduledTargets;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readLvRestWindowSessionMetadata(
  metadata: unknown,
): LvRestWindowSessionMetadata {
  if (!isPlainObject(metadata)) return {};
  return metadata as LvRestWindowSessionMetadata;
}

export function mergeLvRestTargetJobMetadata(
  metadata: unknown,
  targetType: LvRestTargetType,
  patch: Partial<LvRestTargetJobMetadata>,
): Prisma.InputJsonValue {
  const current = readLvRestWindowSessionMetadata(metadata);
  const scheduledTargets = { ...(current.scheduledTargets ?? {}) };
  const existing = scheduledTargets[targetType] ?? {
    idempotencyKey: patch.idempotencyKey ?? '',
    scheduledFor: patch.scheduledFor ?? new Date().toISOString(),
    status: LV_REST_TARGET_JOB_STATUS.SCHEDULED,
  };

  scheduledTargets[targetType] = {
    ...existing,
    ...patch,
    idempotencyKey: patch.idempotencyKey ?? existing.idempotencyKey,
    scheduledFor: patch.scheduledFor ?? existing.scheduledFor,
    status: patch.status ?? existing.status,
  };

  return {
    ...current,
    scheduledTargets,
  } as unknown as Prisma.InputJsonValue;
}

export function isLvRestTargetAlreadyScheduled(
  metadata: unknown,
  targetType: LvRestTargetType,
): boolean {
  const entry = readLvRestWindowSessionMetadata(metadata).scheduledTargets?.[targetType];
  if (!entry) return false;
  return (
    entry.status === LV_REST_TARGET_JOB_STATUS.SCHEDULED ||
    entry.status === LV_REST_TARGET_JOB_STATUS.ENQUEUED ||
    entry.status === LV_REST_TARGET_JOB_STATUS.RUNNING ||
    entry.status === LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION ||
    entry.status === LV_REST_TARGET_JOB_STATUS.COMPLETED ||
    entry.status === LV_REST_TARGET_JOB_STATUS.MISSED
  );
}
