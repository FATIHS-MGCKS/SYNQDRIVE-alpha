export type PricingIntegritySeverity = 'error' | 'warning' | 'info';

export type PricingIntegrityCheckId =
  | 'multiple_active_versions'
  | 'overlapping_version_windows'
  | 'active_with_unpublished_draft'
  | 'multiple_effective_assignments'
  | 'inactive_group_active_assignment'
  | 'assignment_invalid_target'
  | 'missing_currency'
  | 'invalid_money_amounts'
  | 'possible_migration_deposit'
  | 'booking_missing_snapshot'
  | 'snapshot_missing_tariff_version'
  | 'snapshot_currency_mismatch'
  | 'line_item_missing_source_id'
  | 'orphaned_draft'
  | 'orphaned_or_invalid_quote'
  | 'quote_reuse_anomaly'
  | 'snapshot_deposit_in_revenue'
  | 'group_without_live_or_scheduled';

export interface PricingIntegrityViolation {
  checkId: PricingIntegrityCheckId;
  severity: PricingIntegritySeverity;
  organizationId: string;
  message: string;
  entityType: string;
  entityId: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface PricingIntegrityCheckResult {
  checkId: PricingIntegrityCheckId;
  severity: PricingIntegritySeverity;
  count: number;
  violations: PricingIntegrityViolation[];
}

export interface PricingIntegrityAuditReport {
  mode: 'audit';
  generatedAt: string;
  organizationId: string | null;
  organizationCount: number;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  checks: PricingIntegrityCheckResult[];
}

export interface PricingIntegrityRepairAction {
  actionId: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  description: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface PricingIntegrityRepairReport {
  mode: 'repair';
  dryRun: boolean;
  confirmed: boolean;
  generatedAt: string;
  organizationId: string;
  actions: PricingIntegrityRepairAction[];
  skipped: Array<{ reason: string; checkId?: string; entityId?: string }>;
  audit: PricingIntegrityAuditReport;
}
