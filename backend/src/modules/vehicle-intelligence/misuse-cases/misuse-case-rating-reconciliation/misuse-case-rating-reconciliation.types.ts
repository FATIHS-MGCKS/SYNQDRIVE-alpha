import type {
  DrivingAttributionConfidence,
  MisuseAttributionScope,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
} from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';
import type { TripEvidenceLevel } from '../../trips/trip-evidence-level.types';

export type CoverageQuality = 'NONE' | 'SPARSE' | 'GOOD';

export type MisuseCaseRatingReconciliationInput = {
  caseType: MisuseCaseType;
  qualifiedEvidence: EvidenceCandidate[];
  evidenceLevel: TripEvidenceLevel;
  attributionScope: MisuseAttributionScope;
  attributionConfidence: DrivingAttributionConfidence;
  clusterCount?: number;
  coverageQuality?: CoverageQuality;
  modelVersion: string;
  existingSeverity?: MisuseCaseSeverity | null;
  existingConfidence?: MisuseCaseConfidence | null;
};

export type RatingReconciliationAuditEntry = {
  modelVersion: string;
  evaluatedAt: string;
  previousSeverity: MisuseCaseSeverity | null;
  previousConfidence: MisuseCaseConfidence | null;
  reconciledSeverity: MisuseCaseSeverity;
  reconciledConfidence: MisuseCaseConfidence;
  direction: 'UPGRADE' | 'DOWNGRADE' | 'UNCHANGED' | 'INITIAL';
  reasons: string[];
  sourceStrengthMax: number;
  coverageQuality: CoverageQuality;
  clusterCount: number;
  proxyOnly: boolean;
  hasHighValueEvidence: boolean;
};

export type MisuseCaseRatingReconciliation = {
  severity: MisuseCaseSeverity;
  confidence: MisuseCaseConfidence;
  shouldResolve: boolean;
  resolutionReason: string | null;
  proxyOnly: boolean;
  clusterCount: number;
  coverageQuality: CoverageQuality;
  sourceStrengthMax: number;
  hasHighValueEvidence: boolean;
  modelVersion: string;
  audit: RatingReconciliationAuditEntry;
};
