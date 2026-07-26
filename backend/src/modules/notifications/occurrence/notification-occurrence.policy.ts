import { NotificationCandidateRecoveryState } from '../notification-candidate.contract';
import { isRecoverySeverity } from '../notification-severity.policy';
import { NotificationSeverity as DomainSeverity } from '../notification.enums';
import type {
  EvaluateOccurrenceIngestInput,
  OccurrenceIngestEvaluation,
} from './notification-occurrence.types';

/** Monotonic timeline anchor for out-of-order ingest decisions. */
export function maxOccurredAt(current: Date, incoming: Date): Date {
  return current.getTime() >= incoming.getTime() ? current : incoming;
}

/**
 * Late recovery must not resolve a notification that already has a newer active signal.
 * Compares producer `occurredAt` against the latest accepted active signal timestamp.
 */
export function shouldApplyRecoveryToNotification(
  recoveryOccurredAt: Date,
  latestActiveSignalAt: Date,
): boolean {
  return recoveryOccurredAt.getTime() >= latestActiveSignalAt.getTime();
}

/**
 * Out-of-order active signals are recorded for audit but must not move timeline backwards.
 */
export function isStaleActiveSignal(
  incomingOccurredAt: Date,
  notificationLastSeenAt: Date,
): boolean {
  return incomingOccurredAt.getTime() < notificationLastSeenAt.getTime();
}

export function evaluateOccurrenceIngest(
  input: EvaluateOccurrenceIngestInput,
): OccurrenceIngestEvaluation {
  const lastSeenAt = maxOccurredAt(input.notificationLastSeenAt, input.candidate.occurredAt);

  if (input.duplicateSourceEvent) {
    return {
      action: 'DUPLICATE_SOURCE_EVENT',
      recordOccurrence: false,
      applyRecovery: false,
      applySeverity: false,
      applyLifecycle: false,
      lastSeenAt: input.notificationLastSeenAt,
    };
  }

  if (input.isRecovery) {
    const applyRecovery = shouldApplyRecoveryToNotification(
      input.candidate.occurredAt,
      input.notificationLastSeenAt,
    );
    return {
      action: applyRecovery ? 'ACCEPT' : 'STALE_RECOVERY',
      recordOccurrence: true,
      applyRecovery,
      applySeverity: false,
      applyLifecycle: false,
      lastSeenAt: applyRecovery ? lastSeenAt : input.notificationLastSeenAt,
    };
  }

  const stale = isStaleActiveSignal(input.candidate.occurredAt, input.notificationLastSeenAt);
  return {
    action: stale ? 'STALE_SIGNAL' : 'ACCEPT',
    recordOccurrence: true,
    applyRecovery: false,
    applySeverity: true,
    applyLifecycle: !stale,
    lastSeenAt,
  };
}

export function mapRecoveryStateToOccurrence(
  severity: DomainSeverity,
  recoveryState?: NotificationCandidateRecoveryState,
): 'ACTIVE' | 'RECOVERED' {
  if (recoveryState === NotificationCandidateRecoveryState.RECOVERED) {
    return 'RECOVERED';
  }
  if (isRecoverySeverity(severity)) {
    return 'RECOVERED';
  }
  return 'ACTIVE';
}

/** Retention jobs can partition on organization + observedAt / createdAt. */
export const OCCURRENCE_RETENTION_INDEX_HINTS = [
  'notification_occurrences_org_observed_at_idx',
  'notification_occurrences_created_at_idx',
] as const;
