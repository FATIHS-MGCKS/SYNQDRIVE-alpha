import type { Notification } from '@prisma/client';
import type { NotificationCandidate } from './notification.types';

export type NotificationCoreOperation =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'reopened'
  | 'ignored'
  | 'skipped_flag_off';

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
