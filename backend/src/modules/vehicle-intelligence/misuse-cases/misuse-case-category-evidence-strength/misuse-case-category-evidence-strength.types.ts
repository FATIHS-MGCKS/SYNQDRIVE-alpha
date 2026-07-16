import type {
  DrivingAttributionConfidence,
  MisuseAttributionScope,
  MisuseCaseDecisionEligibility,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';
import type {
  CoverageRequirement,
  CustomerEligibility,
  HealthEligibility,
  MisuseCategoryEffectCaps,
  MisuseCategoryEvidenceKey,
  MisuseCategoryEvidenceProfile,
} from './misuse-case-category-evidence-strength.config';

export type MisuseCategoryMaturity = 'SHADOW' | 'PUBLISHED';

export type MisuseCategoryEvidenceAssessmentInput = {
  caseType: MisuseCaseType;
  qualifiedEvidence: EvidenceCandidate[];
  repetitionCount: number;
  coverageQuality: CoverageRequirement;
  attributionConfidence: DrivingAttributionConfidence;
  attributionScope: MisuseAttributionScope;
  dataQualityIssue?: boolean;
  /** Force shadow maturity (e.g. new engine detector rollout). */
  forceShadow?: boolean;
};

export type MisuseCategoryEvidenceRejectionReason =
  | 'UNPROFILED_CASE_TYPE'
  | 'DATA_QUALITY_ISSUE'
  | 'INSUFFICIENT_COVERAGE'
  | 'INSUFFICIENT_ATTRIBUTION'
  | 'ATTRIBUTION_SCOPE_BLOCKED'
  | 'INSUFFICIENT_REPETITION'
  | 'DISALLOWED_SOURCE_TYPE'
  | 'PROXY_ONLY_INSUFFICIENT';

export type MisuseCategoryEvidenceAssessment = {
  profileKey: MisuseCategoryEvidenceKey | null;
  profile: MisuseCategoryEvidenceProfile | null;
  passes: boolean;
  rejectionReasons: MisuseCategoryEvidenceRejectionReason[];
  maturity: MisuseCategoryMaturity;
  effectCaps: MisuseCategoryEffectCaps;
  healthEligibility: HealthEligibility;
  customerEligibility: CustomerEligibility;
  maxStatus: MisuseCaseStatus;
  maxDecisionEligibility: MisuseCaseDecisionEligibility;
  allowedSourceTypes: MisuseEvidenceSourceType[];
  modelVersion: string;
};
