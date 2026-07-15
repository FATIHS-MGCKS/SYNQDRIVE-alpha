import { BillingStripeMode } from '@prisma/client';

export type BillingLegacyBackfillMode = 'dry-run' | 'execute';

export type BillingLegacyBackfillOrgOutcome =
  | 'migrated'
  | 'already_migrated'
  | 'skipped_no_subscription'
  | 'skipped_no_billing_signal'
  | 'conflict'
  | 'failed';

export type BillingLegacyBackfillConflictCode =
  | 'AMBIGUOUS_BASE_PRODUCT'
  | 'RENTAL_AND_FLEET_ACTIVE'
  | 'NO_PRICE_BOOK'
  | 'NO_ACTIVE_PRICE_VERSION'
  | 'PRICE_BOOK_PRODUCT_MISMATCH'
  | 'CONFLICTING_LEGACY_SOURCES'
  | 'STRIPE_ID_WITHOUT_MODE'
  | 'MULTIPLE_ACTIVE_SUBSCRIPTIONS';

export interface BillingLegacyBackfillAction {
  kind:
    | 'ensure_catalog_product'
    | 'link_price_book_product'
    | 'upsert_stripe_price_mapping'
    | 'update_subscription'
    | 'create_subscription_item'
    | 'document_quantity_event'
    | 'document_price_override'
    | 'set_subscription_stripe_mode';
  entityType: string;
  entityId?: string;
  detail: string;
}

export interface BillingLegacyBackfillOrgRecord {
  organizationId: string;
  companyName: string;
  outcome: BillingLegacyBackfillOrgOutcome;
  inferredProductKey: 'RENTAL' | 'FLEET' | null;
  inferenceSource: 'ORG_PRODUCT' | 'PRICE_BOOK' | 'BUSINESS_TYPE' | null;
  subscriptionId: string | null;
  conflicts: BillingLegacyBackfillConflictCode[];
  actions: BillingLegacyBackfillAction[];
  warnings: string[];
  error?: string;
}

export interface BillingLegacyBackfillGlobalSummary {
  catalogProductsEnsured: number;
  priceBooksLinked: number;
  stripeMappingsUpserted: number;
  stripeModeClassified: BillingStripeMode | null;
  defaultStripePriceId: string | null;
}

export interface BillingLegacyBackfillSummary {
  organizationsScanned: number;
  migrated: number;
  alreadyMigrated: number;
  skippedNoSubscription: number;
  skippedNoBillingSignal: number;
  conflicts: number;
  failed: number;
}

export interface BillingLegacyBackfillCheckpoint {
  lastOrganizationId: string | null;
  processedCount: number;
  updatedAt: string;
}

export interface BillingLegacyBackfillReport {
  mode: BillingLegacyBackfillMode;
  startedAt: string;
  finishedAt: string;
  global: BillingLegacyBackfillGlobalSummary;
  summary: BillingLegacyBackfillSummary;
  organizations: BillingLegacyBackfillOrgRecord[];
  checkpoint: BillingLegacyBackfillCheckpoint;
  failures: Array<{ organizationId: string; error: string }>;
}

export interface BillingLegacyBackfillRunOptions {
  dryRun: boolean;
  organizationId?: string;
  limit?: number;
  checkpoint?: BillingLegacyBackfillCheckpoint | null;
}
