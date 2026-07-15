import type {
  TaskDiagnosticCategory,
  TaskDiagnosticCheckId,
  TaskDiagnosticSeverity,
} from './task-data-diagnostic.types';

export interface TaskDiagnosticCheckMeta {
  category: TaskDiagnosticCategory;
  severity: TaskDiagnosticSeverity;
  label: string;
}

export const TASK_DIAGNOSTIC_CHECK_META: Record<TaskDiagnosticCheckId, TaskDiagnosticCheckMeta> = {
  done_missing_completed_at: {
    category: 'done_integrity',
    severity: 'error',
    label: 'DONE without completedAt',
  },
  done_missing_completion_mode: {
    category: 'done_integrity',
    severity: 'warning',
    label: 'DONE without completionMode',
  },
  done_missing_completion_event: {
    category: 'done_integrity',
    severity: 'error',
    label: 'DONE without matching completion event',
  },
  done_with_open_required_checklist: {
    category: 'done_checklist',
    severity: 'error',
    label: 'DONE with open required checklist items',
  },
  done_with_fully_open_checklist: {
    category: 'done_checklist',
    severity: 'warning',
    label: 'DONE with fully open checklist (legacy)',
  },
  done_contradictory_resolution_note: {
    category: 'done_integrity',
    severity: 'warning',
    label: 'DONE with contradictory resolutionNote',
  },
  done_with_cancelled_at: {
    category: 'timing',
    severity: 'warning',
    label: 'DONE with cancelledAt set',
  },
  active_duplicate_dedup_key: {
    category: 'active_duplicates',
    severity: 'error',
    label: 'Multiple active tasks sharing dedupKey',
  },
  multiple_booking_preparation: {
    category: 'active_duplicates',
    severity: 'error',
    label: 'Multiple active BOOKING_PREPARATION per booking',
  },
  multiple_document_review_phase: {
    category: 'active_duplicates',
    severity: 'error',
    label: 'Multiple active DOCUMENT_REVIEW per booking phase',
  },
  multiple_vehicle_cleaning_window: {
    category: 'active_duplicates',
    severity: 'error',
    label: 'Multiple active VEHICLE_CLEANING per vehicle window',
  },
  multiple_invoice_payment_task: {
    category: 'active_duplicates',
    severity: 'error',
    label: 'Multiple active invoice payment-check tasks',
  },
  missing_link_booking: {
    category: 'missing_links',
    severity: 'error',
    label: 'bookingId references missing booking',
  },
  missing_link_vehicle: {
    category: 'missing_links',
    severity: 'error',
    label: 'vehicleId references missing vehicle',
  },
  missing_link_invoice: {
    category: 'missing_links',
    severity: 'error',
    label: 'invoiceId references missing invoice',
  },
  missing_link_document: {
    category: 'missing_links',
    severity: 'warning',
    label: 'documentId references missing document row',
  },
  cross_org_booking_link: {
    category: 'missing_links',
    severity: 'error',
    label: 'bookingId belongs to another organization',
  },
  cross_org_vehicle_link: {
    category: 'missing_links',
    severity: 'error',
    label: 'vehicleId belongs to another organization',
  },
  cross_org_invoice_link: {
    category: 'missing_links',
    severity: 'error',
    label: 'invoiceId belongs to another organization',
  },
  cross_org_document_link: {
    category: 'missing_links',
    severity: 'error',
    label: 'documentId belongs to another organization',
  },
  timing_activates_after_due: {
    category: 'timing',
    severity: 'warning',
    label: 'activatesAt after dueDate',
  },
  timing_completed_before_created: {
    category: 'timing',
    severity: 'error',
    label: 'completedAt before createdAt',
  },
  timing_future_activates_legacy_visible: {
    category: 'timing',
    severity: 'info',
    label: 'Future activatesAt with active status (legacy-visible)',
  },
  audit_status_event_mismatch: {
    category: 'audit',
    severity: 'error',
    label: 'Task status mismatches last status event',
  },
  audit_auto_close_without_event: {
    category: 'audit',
    severity: 'error',
    label: 'AUTO_RESOLVED completionMode without AUTO_RESOLVED event',
  },
  audit_assignment_without_event: {
    category: 'audit',
    severity: 'warning',
    label: 'Assignment without ASSIGNED event',
  },
  legacy_automation_source: {
    category: 'legacy_automation',
    severity: 'info',
    label: 'Non-canonical automation source string',
  },
  legacy_dedup_key_format: {
    category: 'legacy_automation',
    severity: 'info',
    label: 'Legacy or non-canonical dedupKey format',
  },
};
