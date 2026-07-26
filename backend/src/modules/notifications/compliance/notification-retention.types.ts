export interface NotificationRetentionPhaseResult {
  phase: string;
  candidates: number;
  affected: number;
  skipped: number;
  failed: number;
}

export interface NotificationRetentionReport {
  runId?: string;
  trigger: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: NotificationRetentionPhaseResult[];
  totals: {
    candidates: number;
    affected: number;
    skipped: number;
    failed: number;
  };
}

export interface NotificationRetentionRunOptions {
  organizationId?: string;
  trigger?: 'cron' | 'manual';
  dryRun?: boolean;
  correlationId?: string;
}

export interface NotificationDataSubjectExport {
  organizationId: string;
  userId?: string;
  customerId?: string;
  notifications: Array<{
    id: string;
    eventType: string;
    status: string;
    severity: string;
    entityType: string;
    entityId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    templateParams: Record<string, unknown>;
    receipts?: Array<{ userId: string; readAt: string | null; acknowledgedAt: string | null }>;
  }>;
}

export interface NotificationErasureReport {
  organizationId: string;
  dryRun: boolean;
  anonymizedNotifications: number;
  deletedNotifications: number;
  redactedOutboxRows: number;
  skippedLegalHold: number;
}
