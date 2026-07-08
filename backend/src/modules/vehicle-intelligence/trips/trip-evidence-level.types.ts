import type { MisuseCaseConfidence } from '@prisma/client';

export type TripEvidenceLevel =
  | 'NONE'
  | 'INFO'
  | 'CHECK_RECOMMENDED'
  | 'MISUSE_SUSPECTED'
  | 'DAMAGE_RISK'
  | 'CRITICAL_DAMAGE_RISK';

export type TripEvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type TripEvidenceCaseSource =
  | 'NATIVE_EVENT'
  | 'HF_RECONSTRUCTION'
  | 'CONTEXT_ENRICHMENT'
  | 'MIXED';

export interface TripEvidenceMeasurements {
  rpm?: number;
  throttle?: number;
  engineLoad?: number;
  coolant?: number;
  speedBeforeAfter?: string;
  durationMs?: number;
}

export interface TripEvidenceCase {
  id: string;
  type: string;
  evidenceLevel: TripEvidenceLevel;
  title: string;
  explanation: string;
  confidence: TripEvidenceConfidence;
  chargeable: boolean;
  requiresHumanReview: boolean;
  reasons: string[];
  measurements: TripEvidenceMeasurements;
  source: TripEvidenceCaseSource;
}

export const EVIDENCE_LEVEL_RANK: Record<TripEvidenceLevel, number> = {
  NONE: 0,
  INFO: 1,
  CHECK_RECOMMENDED: 2,
  MISUSE_SUSPECTED: 3,
  DAMAGE_RISK: 4,
  CRITICAL_DAMAGE_RISK: 5,
};

export function maxEvidenceLevel(
  a: TripEvidenceLevel,
  b: TripEvidenceLevel,
): TripEvidenceLevel {
  return EVIDENCE_LEVEL_RANK[a] >= EVIDENCE_LEVEL_RANK[b] ? a : b;
}

export function requiresHumanReviewForLevel(level: TripEvidenceLevel): boolean {
  return EVIDENCE_LEVEL_RANK[level] >= EVIDENCE_LEVEL_RANK.CHECK_RECOMMENDED;
}

export function toTripEvidenceConfidence(
  confidence: MisuseCaseConfidence | TripEvidenceConfidence,
): TripEvidenceConfidence {
  if (confidence === 'HIGH') return 'HIGH';
  if (confidence === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

export function evidenceLevelMeetsReviewThreshold(level: TripEvidenceLevel): boolean {
  return requiresHumanReviewForLevel(level);
}
