import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import type { VsiApdsP5b2HistoricalScientificMetricsV1 } from './vsi-apds-p5b2.types';

export function buildP5b2HistoricalScientificMetrics(
  rows: readonly VsiApdsP5b1OfflineCorrelationRowV1[],
): VsiApdsP5b2HistoricalScientificMetricsV1 {
  let uniqueLinkAttributed = 0;
  let priorRevisionFound = 0;
  let noPriorRevision = 0;
  let temporalAuthorityUnproven = 0;
  let commitVisibilityUnproven = 0;
  let verifiedDecisionTimeEvidence = 0;
  let currentProfileOnly = 0;
  let correlationNotAssessable = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (row.processingStatus === 'CORRELATION_ERROR') {
      errorCount += 1;
      continue;
    }
    if (row.sourceLinkAttribution.status === 'UNIQUE_ATTRIBUTED') {
      uniqueLinkAttributed += 1;
    }

    const authority = row.historicalRevisionAuthority;
    if (authority === VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND) {
      priorRevisionFound += 1;
    } else if (authority === VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION) {
      noPriorRevision += 1;
    } else if (
      authority === VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY ||
      authority === VsiProfileRevisionAsOfAuthority.STALE_AT_DECISION
    ) {
      temporalAuthorityUnproven += 1;
    }

    if (
      row.historicalRevisionLimitations?.includes('PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN') ||
      row.historicalRevisionEvidence?.commitVisibilityProven === false
    ) {
      commitVisibilityUnproven += 1;
    }

    const interpretation = row.observation?.profileEvidenceInterpretation;
    if (
      interpretation === VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT
    ) {
      verifiedDecisionTimeEvidence += 1;
    }
    if (interpretation === VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW) {
      currentProfileOnly += 1;
    }
    if (row.processingStatus === 'PROFILE_NOT_ASSESSABLE') {
      correlationNotAssessable += 1;
    }
  }

  return {
    totalDecisions: rows.length,
    uniqueLinkAttributed,
    priorRevisionFound,
    noPriorRevision,
    temporalAuthorityUnproven,
    commitVisibilityUnproven,
    verifiedDecisionTimeEvidence,
    currentProfileOnly,
    correlationNotAssessable,
    errorCount,
  };
}
