import { NotificationEventKind, NotificationStatus } from './notification.enums';
import type {
  NotificationMaterializeDecision,
  NotificationOccurrenceInput,
  NotificationReopenPolicy,
  NotificationRecord,
  NotificationResolutionPolicy,
} from './notification.types';

export const DEFAULT_STATE_REOPEN_POLICY: NotificationReopenPolicy = {
  cooldownMs: 15 * 60_000,
  stabilityWindowMs: 5 * 60_000,
  maxReopensBeforeNewGeneration: 5,
};

export const DEFAULT_EVENT_RESOLUTION_POLICY: NotificationResolutionPolicy = {
  eventKind: NotificationEventKind.EVENT,
  autoResolveWhenConditionClears: false,
};

export const DEFAULT_STATE_RESOLUTION_POLICY: NotificationResolutionPolicy = {
  eventKind: NotificationEventKind.STATE,
  autoResolveWhenConditionClears: true,
  reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
};

export interface ReopenEvaluationInput {
  existing: Pick<NotificationRecord, 'id' | 'status' | 'resolvedAt' | 'reopenCount' | 'generation'>;
  occurrence: NotificationOccurrenceInput;
  policy: NotificationResolutionPolicy;
  referenceNow: Date;
}

/**
 * Determines whether a resolved STATE notification should reopen, start a new generation,
 * or be ignored due to cooldown/flutter protection.
 */
export function evaluateReopenDecision(
  input: ReopenEvaluationInput,
): NotificationMaterializeDecision {
  const { existing, occurrence, policy, referenceNow } = input;

  if (existing.status === NotificationStatus.ARCHIVED) {
    return { action: 'IGNORE', reason: 'ARCHIVED' };
  }

  if (existing.status !== NotificationStatus.RESOLVED) {
    return { action: 'UPDATE', notificationId: existing.id, generation: existing.generation };
  }

  if (policy.eventKind === NotificationEventKind.EVENT) {
    const maxGen = policy.reopenPolicy?.maxReopensBeforeNewGeneration ?? 1;
    if (existing.reopenCount + 1 >= maxGen) {
      return { action: 'CREATE', generation: existing.generation + 1 };
    }
    return {
      action: 'CREATE',
      generation: existing.generation + 1,
    };
  }

  const reopen = policy.reopenPolicy ?? DEFAULT_STATE_REOPEN_POLICY;
  const resolvedAt = existing.resolvedAt ?? occurrence.occurredAt;
  const elapsedMs = referenceNow.getTime() - resolvedAt.getTime();

  if (elapsedMs < reopen.cooldownMs) {
    return { action: 'IGNORE', reason: 'COOLDOWN' };
  }

  const maxReopens = reopen.maxReopensBeforeNewGeneration ?? DEFAULT_STATE_REOPEN_POLICY.maxReopensBeforeNewGeneration!;
  if (existing.reopenCount >= maxReopens) {
    return { action: 'CREATE', generation: existing.generation + 1 };
  }

  return {
    action: 'REOPEN',
    notificationId: existing.id,
    generation: existing.generation,
    reopenCount: existing.reopenCount + 1,
  };
}

export function shouldAutoResolveState(
  policy: NotificationResolutionPolicy,
  conditionActive: boolean,
): boolean {
  return policy.eventKind === NotificationEventKind.STATE
    && policy.autoResolveWhenConditionClears
    && !conditionActive;
}
