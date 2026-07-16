import type {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseType,
} from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';

export type MisuseCaseScope =
  | { kind: 'TRIP'; tripId: string }
  | { kind: 'RENTAL'; bookingId: string };

export type MisuseCaseLogicalFingerprintInput = {
  organizationId: string;
  vehicleId: string;
  scope: MisuseCaseScope;
  category: MisuseCaseCategory;
  caseType: MisuseCaseType;
  attributionScope: MisuseAttributionScope;
  evidence: EvidenceCandidate[];
};

export type MisuseCaseFingerprintInput = MisuseCaseLogicalFingerprintInput & {
  modelVersion?: string;
};

export type MisuseCaseFingerprintPair = {
  /** Logical identity without model version — stored in `inputFingerprint`. */
  logicalFingerprint: string;
  /** Unique case row identity including model version — stored in `fingerprint`. */
  caseFingerprint: string;
  modelVersion: string;
  qualifiedEvidenceKeys: string[];
};

export type MisuseCaseReconciliationResult =
  | { action: 'CREATE'; priorCaseId: string | null }
  | { action: 'UPDATE'; existingId: string }
  | { action: 'SUPERSEDE'; priorCaseId: string };
