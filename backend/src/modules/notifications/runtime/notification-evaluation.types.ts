export type NotificationEvaluationTriggerClass = 'debounced' | 'scheduled' | 'scheduled_boot';

export interface NotificationEvaluationJobData {
  organizationId: string;
  triggerType: string;
  triggerClass: NotificationEvaluationTriggerClass;
  scheduledAt: string;
  runId: string;
  coalescedEvents?: string[];
}

export interface NotificationEvaluationRunStats {
  candidateCount: number;
  createdCount: number;
  updatedCount: number;
  resolvedCount: number;
  deduplicatedCount: number;
  failureCount: number;
}

export interface NotificationEvaluationRunContext {
  runId: string;
  organizationId: string;
  triggerType: string;
  triggerClass: NotificationEvaluationTriggerClass;
  scheduledAt: Date;
  startedAt: Date;
  completedAt?: Date;
  stats: NotificationEvaluationRunStats;
}

export interface NotificationEvaluationRunResult {
  runId: string;
  organizationId: string;
  triggerType: string;
  skipped?: boolean;
  skipReason?: 'lock_contended' | 'lock_redis_unavailable' | 'coalesced_to_follow_up';
  followUpScheduled?: boolean;
  stats: NotificationEvaluationRunStats;
  durationMs?: number;
  insightsRunId?: string;
  publishedCount?: number;
}

export const EMPTY_RUN_STATS = (): NotificationEvaluationRunStats => ({
  candidateCount: 0,
  createdCount: 0,
  updatedCount: 0,
  resolvedCount: 0,
  deduplicatedCount: 0,
  failureCount: 0,
});
