export type TaskAutomationWorkflowMigrationMode = 'dry-run' | 'execute';

export type TaskAutomationWorkflowMigrationRecordStatus =
  | 'migrated'
  | 'already_migrated'
  | 'skipped_customized'
  | 'requires_remediation'
  | 'failed';

export interface TaskAutomationWorkflowMigrationStats {
  analyzed: number;
  migrated: number;
  alreadyMigrated: number;
  skippedCustomized: number;
  requiresRemediation: number;
  failed: number;
  legacyWorkflowsNormalized: number;
}

export interface TaskAutomationWorkflowMigrationRuleResult {
  legacyRuleId: string;
  catalogKey: string | null;
  workflowId: string | null;
  status: TaskAutomationWorkflowMigrationRecordStatus;
  overrideApplied: boolean;
  remediationReason?: string;
  rollbackWorkflowVersion?: number | null;
  testScenario?: string;
}

export interface TaskAutomationWorkflowMigrationReport {
  mode: TaskAutomationWorkflowMigrationMode;
  organizationId: string;
  migrationRunId: string;
  startedAt: string;
  finishedAt: string;
  runtimeMode: string;
  stats: TaskAutomationWorkflowMigrationStats;
  rules: TaskAutomationWorkflowMigrationRuleResult[];
  failures: Array<{ legacyRuleId: string; error: string }>;
}

export interface TaskAutomationWorkflowMigrationRunOptions {
  organizationId: string;
  mode: TaskAutomationWorkflowMigrationMode;
  /** Sync canonical template fields even when user-customized flag is set. */
  forceBaselineSync?: boolean;
}
