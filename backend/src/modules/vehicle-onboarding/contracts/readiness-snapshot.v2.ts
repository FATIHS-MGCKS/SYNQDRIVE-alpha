import type { OrgProductStatus, ProductSlug } from '@prisma/client';
import { READINESS_SNAPSHOT_VERSION_V2 } from './vo-document-versions';
import type { ReadinessRuleResultV1 } from './readiness-rule-result.v1';

export type ReadinessDecisionV2 = 'READY' | 'NOT_READY' | 'REVIEW_REQUIRED';

export interface VehicleOnboardingReadinessSnapshotV2 {
  version: typeof READINESS_SNAPSHOT_VERSION_V2;
  profileId: string;
  profileVersion: string;
  evaluatedAt: string;
  sealedAt: string;
  sealedByUserId: string | null;
  decision: ReadinessDecisionV2;
  attestationSource: 'VO4_READINESS_ENGINE';
  schemaRequiredFieldsMet: boolean;
  readinessInputFingerprint: string;
  sourceSetFingerprint: string;
  productContext: {
    selectedProductSlug: ProductSlug;
    productEntitlementStatus: OrgProductStatus;
    organizationBusinessType: string;
    profileId: string;
    profileVersion: string;
  };
  jurisdictionContext: {
    code: string;
    authority: string;
  };
  powertrainContext: {
    classification: string;
  };
  ruleResults: ReadinessRuleResultV1[];
  blockingFailureCount: number;
  reviewRequiredCount: number;
  deferredCount: number;
  unknownAllowedCount: number;
}
