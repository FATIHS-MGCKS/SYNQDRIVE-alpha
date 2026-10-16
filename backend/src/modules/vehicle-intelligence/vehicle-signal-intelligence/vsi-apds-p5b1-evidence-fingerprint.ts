import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from './vsi-apds-p5b1-canonical-json';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import {
  VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
  VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
} from './vsi-apds-p5b1.contract';

export function buildP5b1CorrelationEvidenceFingerprint(
  row: VsiApdsP5b1OfflineCorrelationRowV1,
): string {
  const demand =
    row.observation?.consumerDemand?.map((d) => ({
      requirementId: d.requirementId,
      demandClassification: d.demandClassification,
      assessmentStatus: d.assessmentStatus,
      discrepancyReasons: [...d.discrepancyReasons],
      canonicalSignalKeys: [...d.canonicalSignalKeys],
      domainApprovalStatus: d.domainApprovalStatus,
    })) ?? [];

  const signals =
    row.observation?.signals?.map((s) => ({
      canonicalSignalKey: s.canonicalSignalKey,
      declaredSupport: s.declaredSupport,
      empiricalObservation: s.empiricalObservation,
      freshnessAtEvaluation: s.freshnessAtEvaluation,
      qualityClassification: s.qualityClassification,
      limitations: [...s.limitations],
    })) ?? [];

  const stable = {
    offlineContractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
    evidenceContractVersion: VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
    processingStatus: row.processingStatus,
    errorCode: row.errorCode,
    decisionIdentity: row.decisionIdentity,
    originalApdsDecision: row.originalApdsDecision,
    originalApdsReason: row.originalApdsReason,
    sourceLinkAttribution: row.sourceLinkAttribution,
    profileFingerprint: row.observation?.profileContentFingerprint ?? null,
    profileRevision: row.observation?.profileRevision ?? null,
    vsiContractVersion: row.observation?.contractVersion ?? null,
    requirementsVersion: row.observation?.requirementsContractVersion ?? null,
    profileEvidenceInterpretation: row.observation?.profileEvidenceInterpretation ?? null,
    shadowBindingStatus: row.observation?.shadowBindingStatus ?? null,
    shadowBindingReasons: row.observation?.shadowBindingReasons ?? [],
    attributionStatus: row.observation?.attributionStatus ?? null,
    evidenceLimitations: row.observation?.evidenceLimitations ?? [],
    consumerDemand: demand,
    signals,
    correlationMatched: row.correlation?.matchedVehicleLink ?? null,
    matchingCapabilities: row.correlation?.matchingCapabilities ?? [],
    missingCapabilities: row.correlation?.missingCapabilities ?? [],
    observedVersusDemandedDifferences: row.correlation?.observedVersusDemandedDifferences ?? [],
    investigationHints: row.investigationHints ?? [],
  };

  return createHash('sha256').update(canonicalJsonStringify(stable)).digest('hex');
}
