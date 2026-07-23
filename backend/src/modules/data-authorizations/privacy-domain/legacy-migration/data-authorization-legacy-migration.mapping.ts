import { createHash } from 'crypto';
import {
  DataAuthorizationLegacyMigrationReviewReason,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';
import { normalizeDataCategories } from '../../data-authorization-risk.util';
import { DATA_AUTHORIZATION_PURPOSES, DIMO_TELEMETRY_SYSTEM_KEY } from '../../data-authorization.constants';
import type { LegacyOrgAuthSnapshot, LegacyVpcSnapshot, MigrationClassification } from './data-authorization-legacy-migration.types';

const PURPOSE_SET = new Set<string>(DATA_AUTHORIZATION_PURPOSES);
const CATEGORY_SET = new Set<string>(Object.values(PrivacyProcessingDataCategory));

export function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function buildMigrationFingerprint(
  sourceType: string,
  legacySourceId: string,
  targetType: string,
): string {
  return createHash('sha256')
    .update(`${sourceType}:${legacySourceId}:${targetType}`)
    .digest('hex');
}

export function deriveActivityCode(orgAuth: LegacyOrgAuthSnapshot): string {
  if (orgAuth.systemKey) {
    return `LEGACY_${orgAuth.systemKey}`.slice(0, 80);
  }
  const slug = orgAuth.moduleOrigin
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `LEGACY_${slug || 'ORG_AUTH'}`.slice(0, 80);
}

export function deriveActivityTitle(orgAuth: LegacyOrgAuthSnapshot): string {
  return (orgAuth.title?.trim() || orgAuth.purpose?.trim() || 'Legacy data authorization').slice(0, 200);
}

export function mapLegacyCategories(raw: unknown): {
  mapped: PrivacyProcessingDataCategory[];
  unmapped: string[];
} {
  const normalized = normalizeDataCategories(jsonStringArray(raw));
  const mapped: PrivacyProcessingDataCategory[] = [];
  const unmapped: string[] = [];

  for (const category of normalized) {
    if (CATEGORY_SET.has(category)) {
      mapped.push(category as PrivacyProcessingDataCategory);
    } else {
      unmapped.push(category);
    }
  }

  return { mapped: [...new Set(mapped)], unmapped: [...new Set(unmapped)] };
}

export function mapLegacyPurposes(orgAuth: LegacyOrgAuthSnapshot): {
  mapped: PrivacyProcessingPurpose[];
  unmapped: string[];
} {
  const raw = [...jsonStringArray(orgAuth.purposes)];
  if (orgAuth.purpose) raw.push(orgAuth.purpose);
  const mapped: PrivacyProcessingPurpose[] = [];
  const unmapped: string[] = [];

  for (const purpose of raw) {
    const key = purpose.trim().toUpperCase();
    if (PURPOSE_SET.has(key)) {
      mapped.push(key as PrivacyProcessingPurpose);
    } else {
      unmapped.push(purpose);
    }
  }

  return { mapped: [...new Set(mapped)], unmapped: [...new Set(unmapped)] };
}

export function classifyOrgDataAuthorization(
  orgAuth: LegacyOrgAuthSnapshot,
  relatedVpcStatuses: string[],
): MigrationClassification {
  const { mapped: mappedCategories, unmapped: unmappedCategories } = mapLegacyCategories(
    orgAuth.dataCategories,
  );
  const { mapped: mappedPurposes, unmapped: unmappedPurposes } = mapLegacyPurposes(orgAuth);

  const reviewReasons: DataAuthorizationLegacyMigrationReviewReason[] = [];
  const vehicleIds = jsonStringArray(orgAuth.vehicleIds);

  const isSystemDimo =
    orgAuth.isSystemGenerated ||
    orgAuth.systemKey === DIMO_TELEMETRY_SYSTEM_KEY ||
    orgAuth.sourceType === 'DIMO';

  if (isSystemDimo) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.SYSTEM_GENERATED_DIMO);
  }

  if (orgAuth.status === 'ACTIVE') {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.ACTIVE_NOT_COMPLIANT);
  }

  if (
    (orgAuth.scope === 'CONNECTED_VEHICLES' || orgAuth.scope === 'VEHICLE') &&
    vehicleIds.length === 0
  ) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.INCOMPLETE_SCOPE);
  }

  if (unmappedCategories.length > 0) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.UNMAPPED_DATA_CATEGORY);
  }

  if (unmappedPurposes.length > 0) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.UNMAPPED_PURPOSE);
  }

  reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.LEGAL_BASIS_UNCLEAR);

  const contradictoryProviderState =
    orgAuth.status === 'ACTIVE' &&
    relatedVpcStatuses.some((status) => status === 'REVOKED' || status === 'EXPIRED');

  if (contradictoryProviderState) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.CONTRADICTORY_PROVIDER_STATE);
  }

  const isProviderCandidate =
    orgAuth.sourceType === 'DIMO' ||
    orgAuth.processorType === 'EXTERNAL_PARTNER' ||
    isSystemDimo;

  return {
    reviewReasons: [...new Set(reviewReasons)],
    mappedCategories,
    mappedPurposes,
    unmappedCategories,
    unmappedPurposes,
    activityCode: deriveActivityCode(orgAuth),
    activityTitle: deriveActivityTitle(orgAuth),
    isProviderCandidate,
    isProcessingActivityCandidate: mappedCategories.length > 0 || mappedPurposes.length > 0,
    isEnforcementPolicyCandidate: mappedCategories.length > 0 && mappedPurposes.length > 0,
    incompleteScope:
      reviewReasons.includes(DataAuthorizationLegacyMigrationReviewReason.INCOMPLETE_SCOPE),
    contradictoryProviderState,
  };
}

export function classifyVehicleProviderConsent(
  vpc: LegacyVpcSnapshot,
  orgAuthStatus: string | null,
): MigrationClassification {
  const reviewReasons: DataAuthorizationLegacyMigrationReviewReason[] = [];

  if (vpc.provider.toUpperCase() === 'DIMO') {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.SYSTEM_GENERATED_DIMO);
  }

  if (vpc.status === 'ACTIVE') {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.ACTIVE_NOT_COMPLIANT);
  }

  if (!vpc.scopes?.length) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.PROVIDER_SCOPE_UNKNOWN);
  }

  const contradictoryProviderState =
    vpc.status === 'ACTIVE' && orgAuthStatus === 'REVOKED';

  if (contradictoryProviderState) {
    reviewReasons.push(DataAuthorizationLegacyMigrationReviewReason.CONTRADICTORY_PROVIDER_STATE);
  }

  return {
    reviewReasons: [...new Set(reviewReasons)],
    mappedCategories: [],
    mappedPurposes: [],
    unmappedCategories: [],
    unmappedPurposes: [],
    activityCode: `LEGACY_VPC_${vpc.provider}`.slice(0, 80),
    activityTitle: `Legacy provider consent (${vpc.provider})`,
    isProviderCandidate: true,
    isProcessingActivityCandidate: false,
    isEnforcementPolicyCandidate: false,
    incompleteScope: false,
    contradictoryProviderState,
  };
}
