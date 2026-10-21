import { buildVsiApdsReadonlyCapabilityObservation } from './vsi-apds-readonly.adapter';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { classifyProfileEvidenceFromRevisionAsOf } from './vsi-apds-p5b2-historical-profile-evidence';
import { mapVsiProfileRevisionToCapabilityContext } from './vsi-profile-revision-to-capability-context.mapper';
import {
  VsiProfileRevisionAsOfAuthority,
  VsiProfileRevisionAsOfQueryCompleteness,
} from './vsi-profile-revision-as-of.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import { buildP5b2HistoricalScientificMetrics } from './vsi-apds-p5b2-metrics';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';

function revisionRow(
  partial: Partial<VsiProfileRevisionHistoryRowV1> &
    Pick<VsiProfileRevisionHistoryRowV1, 'profileRevision' | 'evaluatedAt' | 'recordedAt'>,
): VsiProfileRevisionHistoryRowV1 {
  return {
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    contentFingerprint: 'fp-1',
    providerIdentity: 'DIMO',
    verifiedModality: 'HARDWARE_DEVICE',
    telemetrySourceFamily: 'TESLA',
    signalsSnapshot: [
      {
        canonicalSignalKey: 'vehicle_speed',
        declaredSupport: 'LISTED',
        empiricalObservation: 'OBSERVED',
        lastSourceTimestamp: '2026-10-01T12:00:00.000Z',
        lastValidObservationAt: '2026-10-01T12:00:00.000Z',
        freshnessClassification: 'FRESH',
        qualityClassification: 'RELIABLE',
        confidenceLevel: 'HIGH',
        limitations: [],
      },
    ],
    profileLimitations: [],
    materializationTrigger: 'SNAPSHOT_HOOK',
    sourceLinkLifecycleContext: {
      version: 'vsi-profile-revision-link-context-v1',
      linkId: 'link',
      isActive: true,
      activatedAt: '2026-08-01T00:00:00.000Z',
      deactivatedAt: null,
      supersededByLinkId: null,
    },
    sourceProvenance: {
      version: 'vsi-profile-revision-provenance-v1',
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: '2026-10-01T12:00:00.000Z',
      lastMaterializedProviderFetchAt: '2026-10-01T12:00:00.000Z',
      lastProvenStrictSourceAdvanceAt: null,
    },
    ...partial,
  };
}

describe('vsi-apds-p5b2 historical replay', () => {
  it('maps PRIOR_REVISION_FOUND to LIMITED_HISTORICAL_REVISION_EVIDENCE (not VERIFIED)', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        selectedRevision: revisionRow({
          profileRevision: 3,
          evaluatedAt: new Date('2026-10-10T00:00:00.000Z'),
          recordedAt: new Date('2026-10-10T00:01:00.000Z'),
        }),
        limitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
        queryEvidence: {
          completeness: VsiProfileRevisionAsOfQueryCompleteness.COMPLETE,
          eligibleRevisionCountExact: 1,
          maxEligibleProfileRevision: 3,
        },
      },
      malformedProfileProjection: false,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
    );
    expect(r.historicalRevisionEvidence.commitVisibilityProven).toBe(false);
  });

  it('preserves qualityClassification and confidenceLevel in mapper', () => {
    const ctx = mapVsiProfileRevisionToCapabilityContext(
      revisionRow({
        profileRevision: 1,
        evaluatedAt: new Date('2026-10-10T00:00:00.000Z'),
        recordedAt: new Date('2026-10-10T00:01:00.000Z'),
      }),
    );
    expect(ctx?.signals[0]?.qualityClassification).toBe('RELIABLE');
    expect(ctx?.signals[0]?.confidenceLevel).toBe('HIGH');
  });

  it('HISTORY_AS_OF adapter uses historical link active — not current linkActive', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: {
        organizationId: 'org',
        vehicleId: 'veh',
        providerSourceLinkId: 'link',
        shadowOpportunityId: 'opp',
        shadowDecisionAt: new Date('2026-10-12T00:00:00.000Z'),
        policyVersion: 'p25-apd-b4-v1',
        requirementsContractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      },
      profile: mapVsiProfileRevisionToCapabilityContext(
        revisionRow({
          profileRevision: 2,
          evaluatedAt: new Date('2026-10-11T00:00:00.000Z'),
          recordedAt: new Date('2026-10-11T00:01:00.000Z'),
        }),
      ),
      profileTemporal: null,
      trustedProviderIdentity: 'DIMO',
      trustedVerifiedModality: null,
      trustedTelemetrySourceFamily: null,
      linkActive: false,
      linkSuperseded: false,
      tenantMatch: true,
      currentActiveSourceLinkCount: 0,
      historicalActiveLinkCountAtDecision: 1,
      historicalActiveLinkIds: ['link'],
      historicalLinkUniquenessEvidenceComplete: true,
      persistedShadowDecision: null,
      historicalLinkActiveAtDecision: true,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
      profileEvidenceOverride: {
        interpretation: VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
        decisionTimeRetrospectiveAssessable: true,
        limitations: [],
      },
    });
    expect(obs.signals[0]?.empiricalObservation).toBe('OBSERVED');
    expect(obs.evidenceLimitations).not.toContain('SOURCE_LINK_INACTIVE');
    expect(obs.evidenceLimitations).toContain('HISTORY_AS_OF_OFFLINE_REPLAY');
  });

  it('scientific metrics count commit visibility unproven separately from verified', () => {
    const row = {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        policyVersion: 'p',
        decisionAt: '2026-10-12T00:00:00.000Z',
        activationEpochId: null,
        shadowExecutionVersion: null,
      },
      originalApdsDecision: 'HOLD',
      originalApdsReason: 'r',
      sourceLinkAttribution: {
        status: 'UNIQUE_ATTRIBUTED' as const,
        providerSourceLinkId: 'link',
        historicalActiveLinkCountAtDecision: 1,
        reasons: [],
      },
      observation: {
        profileEvidenceInterpretation:
          VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
      } as never,
      correlation: null,
      investigationHints: [],
      processingStatus: 'CORRELATED' as const,
      errorCode: null,
      skippedReason: null,
      historicalRevisionAuthority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
      historicalRevisionLimitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
      historicalRevisionEvidence: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        limitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
        commitVisibilityProven: false,
      },
    };
    const m = buildP5b2HistoricalScientificMetrics([row]);
    expect(m.priorRevisionFound).toBe(1);
    expect(m.verifiedDecisionTimeEvidence).toBe(0);
    expect(m.commitVisibilityUnproven).toBe(1);
  });
});
