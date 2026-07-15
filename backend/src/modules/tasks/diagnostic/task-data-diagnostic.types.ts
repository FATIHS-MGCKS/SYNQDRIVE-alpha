export type TaskDiagnosticSeverity = 'error' | 'warning' | 'info';

export type TaskDiagnosticCategory =
  | 'done_integrity'
  | 'done_checklist'
  | 'active_duplicates'
  | 'missing_links'
  | 'timing'
  | 'audit'
  | 'legacy_automation';

export type TaskDiagnosticCheckId =
  | 'done_missing_completed_at'
  | 'done_missing_completion_mode'
  | 'done_missing_completion_event'
  | 'done_with_open_required_checklist'
  | 'done_with_fully_open_checklist'
  | 'done_contradictory_resolution_note'
  | 'done_with_cancelled_at'
  | 'active_duplicate_dedup_key'
  | 'multiple_booking_preparation'
  | 'multiple_document_review_phase'
  | 'multiple_vehicle_cleaning_window'
  | 'multiple_invoice_payment_task'
  | 'missing_link_booking'
  | 'missing_link_vehicle'
  | 'missing_link_invoice'
  | 'missing_link_document'
  | 'cross_org_booking_link'
  | 'cross_org_vehicle_link'
  | 'cross_org_invoice_link'
  | 'cross_org_document_link'
  | 'timing_activates_after_due'
  | 'timing_completed_before_created'
  | 'timing_future_activates_legacy_visible'
  | 'audit_status_event_mismatch'
  | 'audit_auto_close_without_event'
  | 'audit_assignment_without_event'
  | 'legacy_automation_source'
  | 'legacy_dedup_key_format';

export interface TaskDiagnosticFinding {
  checkId: TaskDiagnosticCheckId;
  category: TaskDiagnosticCategory;
  severity: TaskDiagnosticSeverity;
  organizationId: string;
  taskId: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface TaskDiagnosticCheckResult {
  checkId: TaskDiagnosticCheckId;
  category: TaskDiagnosticCategory;
  severity: TaskDiagnosticSeverity;
  label: string;
  count: number;
  sampleTaskIds: string[];
}

export interface TaskDiagnosticReport {
  mode: 'diagnostic';
  dryRun: true;
  readOnly: true;
  generatedAt: string;
  referenceNow: string;
  organizationId: string | null;
  organizationCount: number;
  tasksScanned: number;
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<TaskDiagnosticCategory, number>;
    byCheck: Partial<Record<TaskDiagnosticCheckId, number>>;
  };
  checks: TaskDiagnosticCheckResult[];
  findings?: TaskDiagnosticFinding[];
}

export interface TaskDiagnosticRunOptions {
  organizationId?: string;
  sampleLimit?: number;
  referenceNow?: Date;
  includeFindings?: boolean;
}
