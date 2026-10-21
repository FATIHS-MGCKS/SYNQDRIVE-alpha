import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import type { VsiApdsRequirementDemandRowV1 } from './vsi-apds-p5.types';
import type { VsiApdsP5b1PersistedShadowDecisionManifestRow } from './vsi-apds-p5b1-decision.repository';
import type { VsiApdsP5b2Phase2ManifestEntryV1 } from './vsi-apds-p5b2-phase2-manifest';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';

export type VsiApdsP5b2Phase2DecisionResearchRowV1 = {
  persistedShadowDecisionId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: string;
  policyVersion: string;
  realPollId: string | null;
  originalDecision: string;
  originalReason: string;
  processingStatus: VsiApdsP5b1OfflineCorrelationRowV1['processingStatus'];
  providerSourceLinkId: string | null;
  historicalRevisionAuthority: VsiApdsP5b1OfflineCorrelationRowV1['historicalRevisionAuthority'] | null;
  historicalRevisionEvidence: VsiApdsP5b1OfflineCorrelationRowV1['historicalRevisionEvidence'] | null;
  commitVisibilityStatus: 'UNPROVEN' | 'PROVEN' | 'NOT_APPLICABLE';
  consumerDemandAssessment: readonly VsiApdsRequirementDemandRowV1[] | null;
  correlationNotAssessable: boolean;
  errorCode: string | null;
  manifestStratum: string | null;
  manifestMotionState: string | null;
};

function commitVisibilityStatusFromRow(
  row: VsiApdsP5b1OfflineCorrelationRowV1,
  mode: (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode],
): 'UNPROVEN' | 'PROVEN' | 'NOT_APPLICABLE' {
  if (mode === VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE) {
    return 'NOT_APPLICABLE';
  }
  const evidence = row.historicalRevisionEvidence;
  if (!evidence) {
    return 'UNPROVEN';
  }
  return evidence.commitVisibilityProven === true ? 'PROVEN' : 'UNPROVEN';
}

function correlationNotAssessable(row: VsiApdsP5b1OfflineCorrelationRowV1): boolean {
  return (
    row.processingStatus === 'PROFILE_NOT_ASSESSABLE' ||
    row.processingStatus === 'SKIPPED_NO_ATTRIBUTABLE_LINK' ||
    row.correlation == null
  );
}

export function buildPhase2DecisionResearchRow(input: {
  persisted: VsiApdsP5b1PersistedShadowDecisionManifestRow;
  correlationRow: VsiApdsP5b1OfflineCorrelationRowV1;
  manifestEntry?: VsiApdsP5b2Phase2ManifestEntryV1;
  replayProfileMode: (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode];
}): VsiApdsP5b2Phase2DecisionResearchRowV1 {
  const { correlationRow, persisted, manifestEntry, replayProfileMode } = input;
  return {
    persistedShadowDecisionId: persisted.id,
    vehicleId: persisted.vehicleId,
    opportunityId: persisted.opportunityId,
    decisionAt: persisted.decisionAt.toISOString(),
    policyVersion: persisted.policyVersion,
    realPollId: persisted.realPollId,
    originalDecision: persisted.decision,
    originalReason: persisted.reason,
    processingStatus: correlationRow.processingStatus,
    providerSourceLinkId: correlationRow.sourceLinkAttribution.providerSourceLinkId,
    historicalRevisionAuthority: correlationRow.historicalRevisionAuthority ?? null,
    historicalRevisionEvidence: correlationRow.historicalRevisionEvidence ?? null,
    commitVisibilityStatus: commitVisibilityStatusFromRow(correlationRow, replayProfileMode),
    consumerDemandAssessment: correlationRow.observation?.consumerDemand ?? null,
    correlationNotAssessable: correlationNotAssessable(correlationRow),
    errorCode: correlationRow.errorCode,
    manifestStratum: manifestEntry?.stratum ?? null,
    manifestMotionState: manifestEntry?.motionState ?? null,
  };
}

export type VsiApdsP5b2Phase2ScientificAggregatesV1 = {
  decisionsTotal: number;
  byProcessingStatus: Record<string, number>;
  byPolicyVersion: Record<string, number>;
  byDecisionType: Record<string, number>;
  byVehicleId: Record<string, number>;
  byManifestStratum: Record<string, number>;
  byManifestMotion: Record<string, number>;
  safetyStratumCount: number;
  distinctRealPollIds: number;
  b2B4TwinPollGroups: number;
  b2B4TwinSamePollId: number;
  commitVisibilityUnproven: number;
  missingHistoricalRevisionEvidence: number;
  correlationErrors: number;
  elapsedMs: number;
};

export function buildPhase2ScientificAggregates(input: {
  researchRows: readonly VsiApdsP5b2Phase2DecisionResearchRowV1[];
  elapsedMs: number;
}): VsiApdsP5b2Phase2ScientificAggregatesV1 {
  const byProcessingStatus: Record<string, number> = {};
  const byPolicyVersion: Record<string, number> = {};
  const byDecisionType: Record<string, number> = {};
  const byVehicleId: Record<string, number> = {};
  const byManifestStratum: Record<string, number> = {};
  const byManifestMotion: Record<string, number> = {};
  let safetyStratumCount = 0;
  let commitVisibilityUnproven = 0;
  let missingHistoricalRevisionEvidence = 0;
  let correlationErrors = 0;

  const pollIds = new Set<string>();
  const oppGroups = new Map<string, VsiApdsP5b2Phase2DecisionResearchRowV1[]>();

  for (const row of input.researchRows) {
    byProcessingStatus[row.processingStatus] = (byProcessingStatus[row.processingStatus] ?? 0) + 1;
    byPolicyVersion[row.policyVersion] = (byPolicyVersion[row.policyVersion] ?? 0) + 1;
    byDecisionType[row.originalDecision] = (byDecisionType[row.originalDecision] ?? 0) + 1;
    byVehicleId[row.vehicleId] = (byVehicleId[row.vehicleId] ?? 0) + 1;
    if (row.manifestStratum) {
      byManifestStratum[row.manifestStratum] = (byManifestStratum[row.manifestStratum] ?? 0) + 1;
      if (row.manifestStratum === 'SAFETY') {
        safetyStratumCount += 1;
      }
    }
    if (row.manifestMotionState) {
      byManifestMotion[row.manifestMotionState] = (byManifestMotion[row.manifestMotionState] ?? 0) + 1;
    }
    if (row.commitVisibilityStatus === 'UNPROVEN') {
      commitVisibilityUnproven += 1;
    }
    if (!row.historicalRevisionEvidence && row.historicalRevisionAuthority) {
      missingHistoricalRevisionEvidence += 1;
    }
    if (row.processingStatus === 'CORRELATION_ERROR') {
      correlationErrors += 1;
    }
    if (row.realPollId) {
      pollIds.add(row.realPollId);
    }
    const key = `${row.vehicleId}|${row.opportunityId}`;
    const list = oppGroups.get(key) ?? [];
    list.push(row);
    oppGroups.set(key, list);
  }

  let b2B4TwinPollGroups = 0;
  let b2B4TwinSamePollId = 0;
  for (const rows of oppGroups.values()) {
    const policies = new Set(rows.map((r) => r.policyVersion));
    const hasB2 = policies.has('P25_APD_B2_V1');
    const hasB4 = policies.has('P25_APD_B4_V1');
    if (hasB2 && hasB4 && rows.length >= 2) {
      b2B4TwinPollGroups += 1;
      const polls = new Set(rows.map((r) => r.realPollId).filter(Boolean));
      if (polls.size === 1 && polls.size > 0) {
        b2B4TwinSamePollId += 1;
      }
    }
  }

  return {
    decisionsTotal: input.researchRows.length,
    byProcessingStatus,
    byPolicyVersion,
    byDecisionType,
    byVehicleId,
    byManifestStratum,
    byManifestMotion,
    safetyStratumCount,
    distinctRealPollIds: pollIds.size,
    b2B4TwinPollGroups,
    b2B4TwinSamePollId,
    commitVisibilityUnproven,
    missingHistoricalRevisionEvidence,
    correlationErrors,
    elapsedMs: input.elapsedMs,
  };
}
