import type { NotificationCandidate } from '../notification.types';

/** Result of evaluating whether an ingest should materialize a new occurrence row. */
export type OccurrenceIngestAction =
  | 'ACCEPT'
  | 'DUPLICATE_SOURCE_EVENT'
  | 'STALE_RECOVERY'
  | 'STALE_SIGNAL';

export interface OccurrenceIngestEvaluation {
  action: OccurrenceIngestAction;
  /** Persist a new occurrence row (audit trail for accepted + stale out-of-order). */
  recordOccurrence: boolean;
  /** Apply recovery resolve transition on the parent notification. */
  applyRecovery: boolean;
  /** Update parent severity from this ingest (escalation only). */
  applySeverity: boolean;
  /** Update lifecycle side-effects (snooze wake, etc.). */
  applyLifecycle: boolean;
  /** Monotonic lastSeenAt after this ingest. */
  lastSeenAt: Date;
}

export interface EvaluateOccurrenceIngestInput {
  candidate: Pick<
    NotificationCandidate,
    'occurredAt' | 'observedAt' | 'severity' | 'recoveryState' | 'sourceEventId'
  >;
  notificationLastSeenAt: Date;
  isRecovery: boolean;
  duplicateSourceEvent: boolean;
}

export interface OccurrenceRecordInput {
  notificationId: string;
  organizationId: string;
  candidate: NotificationCandidate;
}
