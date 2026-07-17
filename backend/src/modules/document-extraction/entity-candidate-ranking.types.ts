export const ENTITY_CANDIDATE_RANKING_VERSION = '1.0.0';

export const ENTITY_CANDIDATE_TYPES = {
  VEHICLE: 'VEHICLE',
  BOOKING: 'BOOKING',
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  PARTNER: 'PARTNER',
} as const;

export type EntityCandidateType =
  (typeof ENTITY_CANDIDATE_TYPES)[keyof typeof ENTITY_CANDIDATE_TYPES];

export const CONFIDENCE_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[keyof typeof CONFIDENCE_LEVELS];

export const NEGATIVE_REASON_CODES = {
  BLOCKER_CONFLICT: 'BLOCKER_CONFLICT',
  WARNING_CONFLICT: 'WARNING_CONFLICT',
  MULTIPLE_ABOVE_THRESHOLD: 'MULTIPLE_ABOVE_THRESHOLD',
  CONTEXT_CONFLICT: 'CONTEXT_CONFLICT',
  BELOW_HIGH_THRESHOLD: 'BELOW_HIGH_THRESHOLD',
  WEAK_SIGNAL_ONLY: 'WEAK_SIGNAL_ONLY',
} as const;

export type NegativeReasonCode =
  (typeof NEGATIVE_REASON_CODES)[keyof typeof NEGATIVE_REASON_CODES];

export interface EntityCandidateRankingConflict {
  code: string;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface EntityCandidateRankDetail {
  score: number;
  confidenceLevel: ConfidenceLevel;
  positiveReasons: string[];
  negativeReasons: NegativeReasonCode[];
  conflicts: EntityCandidateRankingConflict[];
  rank: number;
  autoSelectEligibility: boolean;
}

export interface RankedEntityCandidate {
  entityType: EntityCandidateType;
  entityId: string;
  ranking: EntityCandidateRankDetail;
}

export interface EntityCandidateRankingPipelineState {
  rankingVersion: string;
  evaluatedAt: string;
  documentType: string;
  preselectionBlocked: boolean;
  preselectionBlockedReason: string | null;
  candidates: RankedEntityCandidate[];
}

export interface EntityCandidateRankingInputItem {
  entityType: EntityCandidateType;
  entityId: string;
  baseScore: number;
  positiveReasons: string[];
  conflicts: EntityCandidateRankingConflict[];
  weakSignalOnly?: boolean;
}

export interface EntityCandidateRankingPolicyInput {
  documentType: string;
  uploadContextResolverStatus?: 'PENDING' | 'ALIGNED' | 'CONFLICT' | 'NO_SIGNAL' | null;
  items: EntityCandidateRankingInputItem[];
}
