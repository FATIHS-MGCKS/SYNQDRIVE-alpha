export type NotificationMigrationMode = 'dry_run' | 'apply';

export type NotificationMigrationItemOutcome =
  | 'migrated'
  | 'merged'
  | 'skipped'
  | 'unresolved'
  | 'failed';

export interface NotificationMigrationStats {
  analyzed: number;
  migrated: number;
  merged: number;
  skipped: number;
  unresolved: number;
  failed: number;
}

export interface NotificationMigrationSkipReason {
  insightId: string;
  reason:
    | 'ALREADY_MIGRATED'
    | 'UNMAPPED_TYPE'
    | 'MISSING_ENTITY'
    | 'INVALID_DEDUPE_KEY'
    | 'INACTIVE_RESOLVED'
    | 'DUPLICATE_FINGERPRINT_IN_BATCH'
    | 'NOT_MIGRATABLE';
  detail?: string;
}

export interface NotificationMigrationFailure {
  insightId: string;
  error: string;
}

export interface NotificationMigrationCheckpoint {
  organizationId: string;
  lastInsightId: string | null;
  lastInsightUpdatedAt: string | null;
  processedCount: number;
  updatedAt: string;
}

export interface NotificationMigrationAnalysisDuplicate {
  organizationId: string;
  fingerprint: string;
  insightIds: string[];
  eventTypes: string[];
  entityIds: string[];
}

export interface NotificationMigrationAnalysisReport {
  generatedAt: string;
  organizationId: string | null;
  mode: NotificationMigrationMode;
  sources: {
    dashboardInsights: {
      total: number;
      active: number;
      inactive: number;
    };
    vehicleComplaints: {
      active: number;
      resolved: number;
    };
    notificationsV2: {
      total: number;
      active: number;
      withLegacyInsightId: number;
    };
    userNotificationPreferences: number;
  };
  duplicates: NotificationMigrationAnalysisDuplicate[];
  sameEntityDifferentCause: Array<{
    organizationId: string;
    entityType: string;
    entityId: string;
    fingerprints: string[];
  }>;
  sameCauseDifferentText: Array<{
    organizationId: string;
    fingerprint: string;
    titles: string[];
    insightIds: string[];
  }>;
  stale: Array<{ insightId: string; updatedAt: string; isActive: boolean }>;
  missingEntityIds: Array<{ insightId: string; type: string; dedupeKey: string }>;
  unmigratable: Array<{ insightId: string; type: string; reason: string }>;
  alreadyMigrated: string[];
  projected: NotificationMigrationStats;
  skipSamples: NotificationMigrationSkipReason[];
}

export interface NotificationMigrationBackfillResult {
  mode: NotificationMigrationMode;
  organizationId: string;
  stats: NotificationMigrationStats;
  checkpoint: NotificationMigrationCheckpoint;
  failures: NotificationMigrationFailure[];
  skipReasons: NotificationMigrationSkipReason[];
}

export interface NotificationMigrationAcceptanceReport {
  generatedAt: string;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
    count?: number;
  }>;
}

export interface NotificationArchitectureAuditFinding {
  area: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface NotificationArchitectureAuditReport {
  generatedAt: string;
  findings: NotificationArchitectureAuditFinding[];
  passed: boolean;
  canonicalEngineConfirmed: boolean;
  parallelLogicRisks: string[];
}
