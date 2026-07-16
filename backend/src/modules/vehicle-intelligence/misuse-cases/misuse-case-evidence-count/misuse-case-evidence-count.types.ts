import type { MisuseEvidenceSourceType } from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';

export type RejectedEvidenceReason =
  | 'UNQUALIFIED_PROXY'
  | 'AGGREGATE_SOURCE'
  | 'DUPLICATE_IN_EVALUATION';

export type RejectedEvidenceAuditEntry = {
  key: string;
  sourceType: MisuseEvidenceSourceType;
  eventType: string;
  reason: RejectedEvidenceReason;
};

export type MisuseCaseEvidenceRecalculation = {
  eventCount: number;
  qualifiedEvidence: EvidenceCandidate[];
  qualifiedEvidenceKeys: string[];
  rejectedEvidence: RejectedEvidenceAuditEntry[];
  modelVersion: string;
};

export type MisuseCaseRejectedEvidenceAudit = {
  modelVersion: string;
  rejected: RejectedEvidenceAuditEntry[];
  qualifiedCount: number;
  evaluatedAt: string;
};
