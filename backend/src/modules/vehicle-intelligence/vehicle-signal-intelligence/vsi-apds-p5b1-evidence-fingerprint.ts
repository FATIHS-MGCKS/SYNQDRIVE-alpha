import { createHash } from 'node:crypto';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import { VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';

export function buildP5b1CorrelationEvidenceFingerprint(
  row: VsiApdsP5b1OfflineCorrelationRowV1,
): string {
  const stable = {
    evidenceContractVersion: VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
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
    correlationMatched: row.correlation?.matchedVehicleLink ?? null,
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
