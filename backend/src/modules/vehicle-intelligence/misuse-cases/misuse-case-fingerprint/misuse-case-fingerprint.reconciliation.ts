import { MisuseCaseStatus } from '@prisma/client';
import type { MisuseCaseFingerprintPair, MisuseCaseReconciliationResult } from './misuse-case-fingerprint.types';

export type MisuseCaseRowForReconciliation = {
  id: string;
  fingerprint: string;
  inputFingerprint: string;
  modelVersion: string;
  status: MisuseCaseStatus;
};

/**
 * Pure reconciliation plan — determines create, update, or supersede.
 */
export function planMisuseCaseReconciliation(
  exactMatch: MisuseCaseRowForReconciliation | null,
  priorVersion: MisuseCaseRowForReconciliation | null,
  fingerprints: MisuseCaseFingerprintPair,
): MisuseCaseReconciliationResult {
  if (
    exactMatch &&
    exactMatch.fingerprint === fingerprints.caseFingerprint &&
    exactMatch.inputFingerprint === fingerprints.logicalFingerprint &&
    exactMatch.modelVersion === fingerprints.modelVersion
  ) {
    return { action: 'UPDATE', existingId: exactMatch.id };
  }

  if (
    priorVersion &&
    priorVersion.inputFingerprint === fingerprints.logicalFingerprint &&
    priorVersion.modelVersion !== fingerprints.modelVersion &&
    priorVersion.status !== MisuseCaseStatus.SUPERSEDED
  ) {
    return { action: 'SUPERSEDE', priorCaseId: priorVersion.id };
  }

  return { action: 'CREATE', priorCaseId: priorVersion?.id ?? null };
}

export const SUPERSEDE_RESOLUTION_REASON =
  'Durch neuere Modellversion ersetzt (misuse-fingerprint)';
