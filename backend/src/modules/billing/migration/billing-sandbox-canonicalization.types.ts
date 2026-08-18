export type BillingSandboxCanonicalizationPhase =
  | 'environment_audit'
  | 'stripe_mode_correction'
  | 'catalog_sync'
  | 'subscription_sync'
  | 'reconciliation_dry_run'
  | 'reconciliation_run';

export interface BillingSandboxCanonicalizationAction {
  phase: BillingSandboxCanonicalizationPhase;
  entityType: string;
  entityId: string;
  detail: string;
  outcome: 'planned' | 'applied' | 'skipped' | 'failed' | 'blocked';
}

export interface BillingSandboxCanonicalizationReport {
  dryRun: boolean;
  runtimeStripeMode: 'TEST' | 'LIVE' | null;
  actions: BillingSandboxCanonicalizationAction[];
  reconciliation?: {
    dryRun: boolean;
    scanned: number;
    driftCount: number;
    errorCount: number;
    drifts: Array<{
      driftType: string;
      severity: string;
      localValue: string | null;
      stripeValue: string | null;
    }>;
  };
  summary: {
    applied: number;
    skipped: number;
    failed: number;
    blocked: number;
  };
}

export interface BillingSandboxCanonicalizationInput {
  dryRun?: boolean;
  organizationId?: string;
  skipCatalogSync?: boolean;
  skipSubscriptionSync?: boolean;
  skipReconciliation?: boolean;
  reconciliationDryRunOnly?: boolean;
}
