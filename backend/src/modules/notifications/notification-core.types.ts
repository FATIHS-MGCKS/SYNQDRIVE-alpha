import type { Notification } from '@prisma/client';
import type { NotificationCandidate } from './notification.types';

export type NotificationCoreOperation =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'reopened'
  | 'ignored'
  | 'skipped_flag_off'
  | 'skipped_auth_denied';

export interface IngestCandidateResult {
  enabled: boolean;
  operation: NotificationCoreOperation;
  notification?: Notification;
  reason?: string;
}

export interface MaterializeResult {
  operation: NotificationCoreOperation;
  notification: Notification;
  reason?: string;
}

export interface IngestCandidateOptions {
  referenceNow?: Date;
  runId?: string;
  /** In-process decision cache — avoids duplicate decision requests per evaluation run. */
  authCache?: import('@modules/data-authorizations/notification-enforcement/notification-enforcement.types').NotificationAuthCache;
  /** When false, notification ingest is blocked (derived data already denied upstream). */
  upstreamAllowed?: boolean;
  upstreamDecisionId?: string | null;
}

export interface ResolveByFingerprintOptions {
  organizationId: string;
  fingerprint: string;
  lifecycleGeneration?: number;
  resolvedAt?: Date;
  sourceType?: string;
  sourceRef?: string;
}

export type ManualResolutionAllowedEventKind = 'EVENT' | 'STATE';

export interface NotificationCounts {
  active: number;
  unreadForUser?: number;
  bySeverity: Record<string, number>;
}

export type { NotificationCandidate };
