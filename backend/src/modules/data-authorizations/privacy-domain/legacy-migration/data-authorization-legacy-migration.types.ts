import type {
  DataAuthorizationLegacyMigrationEntryStatus,
  DataAuthorizationLegacyMigrationMode,
  DataAuthorizationLegacyMigrationReviewReason,
  DataAuthorizationLegacyMigrationSourceType,
  DataAuthorizationLegacyMigrationTargetType,
} from '@prisma/client';

export interface LegacyMigrationOptions {
  mode?: DataAuthorizationLegacyMigrationMode;
  organizationId?: string;
  batchSize?: number;
  rollbackRunId?: string;
}

export interface LegacyMigrationReport {
  runId: string;
  mode: DataAuthorizationLegacyMigrationMode;
  analyzedCount: number;
  migratedCount: number;
  reviewRequiredCount: number;
  errorCount: number;
  skippedCount: number;
  incompleteScopeCount: number;
  contradictoryProviderStateCount: number;
  notMigratedCategories: string[];
  errors: Array<{ sourceType: string; legacySourceId: string; errorCode: string }>;
}

export interface LegacyOrgAuthSnapshot {
  id: string;
  organizationId: string;
  title: string | null;
  purpose: string;
  purposes: unknown;
  dataCategories: unknown;
  scope: string;
  status: string;
  sourceType: string | null;
  systemKey: string | null;
  isSystemGenerated: boolean;
  vehicleIds: unknown;
  customerIds: unknown;
  bookingIds: unknown;
  processorType: string | null;
  processorName: string | null;
  destination: string;
  moduleOrigin: string;
}

export interface LegacyVpcSnapshot {
  id: string;
  organizationId: string;
  vehicleId: string;
  provider: string;
  status: string;
  scopes: string[];
  proofReference: string | null;
  grantType: string;
}

export interface MigrationClassification {
  reviewReasons: DataAuthorizationLegacyMigrationReviewReason[];
  mappedCategories: string[];
  mappedPurposes: string[];
  unmappedCategories: string[];
  unmappedPurposes: string[];
  activityCode: string;
  activityTitle: string;
  isProviderCandidate: boolean;
  isProcessingActivityCandidate: boolean;
  isEnforcementPolicyCandidate: boolean;
  incompleteScope: boolean;
  contradictoryProviderState: boolean;
}

export interface MigrationEntryPlan {
  sourceType: DataAuthorizationLegacyMigrationSourceType;
  legacySourceId: string;
  organizationId: string;
  targetType: DataAuthorizationLegacyMigrationTargetType;
  status: DataAuthorizationLegacyMigrationEntryStatus;
  reviewReasons: DataAuthorizationLegacyMigrationReviewReason[];
  fingerprint: string;
  classification: MigrationClassification;
}
