/**
 * EXP-021 C0.3 — R1 temporal containment for misuse evidence.
 *
 * On Ruptela R1 vehicles, HF-reconstructed behaviour events and event-context
 * windows rest on historical OBD records with unreliable record time. Such
 * evidence is tagged `temporalProvenance = R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN`
 * in its snapshot; the rating layer then prevents it from establishing or
 * upgrading SEVERE+ on its own (see `misuse-case-rating-reconciliation.ts`).
 *
 * Tagging touches `snapshotJson` only — never category, case type, source identity
 * or the evidence set — so case fingerprints and category gates are unchanged.
 */
import { MisuseEvidenceSourceType } from '@prisma/client';
import {
  hasUncertainHistoricalObdRecordTime,
  type TelemetrySourceFamily,
} from '../telemetry-source-family';
import {
  R1_OBD_RECORD_TIME_UNCERTAIN,
  R1_TEMPORAL_CONTAINMENT_VERSION,
} from '../r1-temporal-containment';
import type { CaseCandidate, EvidenceCandidate } from './misuse-case.types';

/** Evidence sources derived from R1 historical OBD records. */
export const R1_TEMPORALLY_UNCERTAIN_SOURCE_TYPES: ReadonlySet<MisuseEvidenceSourceType> = new Set([
  MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
  MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
]);

export function isTemporallyUncertainEvidence(item: EvidenceCandidate): boolean {
  return item.snapshotJson?.temporalProvenance === R1_OBD_RECORD_TIME_UNCERTAIN;
}

export function tagR1TemporallyUncertainEvidence(
  candidate: CaseCandidate,
  family: TelemetrySourceFamily | undefined,
): CaseCandidate {
  if (!family || !hasUncertainHistoricalObdRecordTime(family)) return candidate;

  let uncertainEvidenceCount = 0;
  const evidence = candidate.evidence.map((item) => {
    if (!R1_TEMPORALLY_UNCERTAIN_SOURCE_TYPES.has(item.sourceType)) return item;
    uncertainEvidenceCount += 1;
    return {
      ...item,
      snapshotJson: { ...(item.snapshotJson ?? {}), temporalProvenance: R1_OBD_RECORD_TIME_UNCERTAIN },
    };
  });
  if (uncertainEvidenceCount === 0) return candidate;

  return {
    ...candidate,
    evidence,
    evidenceSummary: {
      ...(candidate.evidenceSummary ?? {}),
      r1TemporalContainment: {
        version: R1_TEMPORAL_CONTAINMENT_VERSION,
        reason: R1_OBD_RECORD_TIME_UNCERTAIN,
        uncertainEvidenceCount,
        independentEvidenceCount: evidence.length - uncertainEvidenceCount,
      },
    },
  };
}
