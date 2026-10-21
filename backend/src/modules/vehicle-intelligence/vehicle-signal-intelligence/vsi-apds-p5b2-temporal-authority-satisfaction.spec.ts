import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
import { classifyProfileEvidenceFromRevisionAsOf } from './vsi-apds-p5b2-historical-profile-evidence';
import { correlateApdsShadowWithVsiCapability } from './vsi-apds-shadow-correlation.engine';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import {
  VsiProfileRevisionAsOfAuthority,
  VsiProfileRevisionAsOfQueryCompleteness,
} from './vsi-profile-revision-as-of.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import { VsiApdsShadowBindingStatus } from './vsi-apds-shadow-opportunity-binding';
import {
  VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
  VsiConsumerModuleId,
  VsiDomainApprovalStatus,
} from './vsi-consumer-requirements.types';
import {
  VsiApdsDemandClassification,
  VSI_APDS_P5_CONTRACT_VERSION,
  type VsiApdsReadonlyCapabilityObservationV1,
} from './vsi-apds-p5.types';
import { VsiApdsCorrelationAnalysisMode } from './vsi-apds-shadow-opportunity-binding';
import { buildP5b2HistoricalScientificMetrics } from './vsi-apds-p5b2-metrics';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';

describe('P5B.2 temporal authority vs consumer satisfaction', () => {
  it('PRIOR_REVISION_FOUND → not decision-time assessable; research preview may SATISFIED', () => {
    const evidence = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        selectedRevision: null,
        limitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
        queryEvidence: {
          completeness: VsiProfileRevisionAsOfQueryCompleteness.COMPLETE,
          eligibleRevisionCountExact: 1,
          maxEligibleProfileRevision: 1,
        },
      },
      malformedProfileProjection: false,
    });
    expect(evidence.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
    );
    expect(evidence.decisionTimeRetrospectiveAssessable).toBe(false);

    const profile = {
      profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
      profileRevision: 1,
      contentFingerprint: 'fp',
      profileLimitations: [],
      signals: [
        {
          canonicalSignalKey: 'lv_voltage',
          declaredSupport: 'LISTED',
          empiricalObservation: 'OBSERVED',
          lastSourceTimestamp: '2026-10-10T12:00:00.000Z',
          lastValidObservationAt: '2026-10-10T12:00:00.000Z',
          freshnessClassification: 'FRESH',
          limitations: [],
        },
      ],
    };
    const withoutPreview = buildVsiConsumerDemandVectorV1({
      profile,
      evaluationTimeMs: new Date('2026-10-12T00:00:00.000Z').getTime(),
      attributionUnknown: false,
      failClosed: false,
      decisionTimeRetrospectiveAssessable: false,
      limitedHistoricalResearchPreview: false,
    });
    expect(
      withoutPreview.some((d) => d.assessmentStatus === 'SATISFIED'),
    ).toBe(false);

    const approvedLvRequirement = {
      contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      consumerModule: VsiConsumerModuleId.BATTERY_V2,
      featureId: 'lv_measurement_gate',
      requirementId: 'battery_v2.lv_voltage.observed',
      canonicalSignalKeys: ['lv_voltage'] as const,
      providerSourceLinkScoped: true as const,
      minimumEvidence: 'EMPIRICAL_OBSERVED' as const,
      maxSignalAgeMs: null,
      minimumQuality: 'ANY_OBSERVED' as const,
      historicalReliability: 'NONE' as const,
      declaredOnlySufficient: false,
      requireAllSignalsTogether: false,
      fallbackChainId: null,
      domainOwner: 'battery_v2',
      domainApprovalStatus: VsiDomainApprovalStatus.APPROVED,
      evidenceReference: 'test-fixture',
    };

    const withPreview = buildVsiConsumerDemandVectorV1({
      profile,
      evaluationTimeMs: new Date('2026-10-12T00:00:00.000Z').getTime(),
      attributionUnknown: false,
      failClosed: false,
      decisionTimeRetrospectiveAssessable: false,
      limitedHistoricalResearchPreview: true,
      requirements: [approvedLvRequirement],
    });
    const previewTagged = withPreview.filter((d) =>
      d.discrepancyReasons.includes('LIMITED_HISTORICAL_RESEARCH_PREVIEW'),
    );
    expect(previewTagged.length).toBeGreaterThan(0);
    expect(
      previewTagged.some(
        (d) => d.assessmentStatus === 'SATISFIED' || d.assessmentStatus === 'INSUFFICIENT',
      ),
    ).toBe(true);
  });

  it('LIMITED research SATISFIED does not populate matchingCapabilities or VERIFIED correlation', () => {
    const observation: VsiApdsReadonlyCapabilityObservationV1 = {
      contractVersion: VSI_APDS_P5_CONTRACT_VERSION,
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      shadowOpportunityId: 'opp',
      shadowDecisionAt: '2026-10-12T00:00:00.000Z',
      policyVersion: 'p25-apd-b4-v1',
      activationEpochId: null,
      requirementsContractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      correlationAnalysisMode: VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
      authoritativePersistedDecision: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        decisionAt: new Date('2026-10-12T00:00:00.000Z'),
        policyVersion: 'p25-apd-b4-v1',
        activationEpochId: null,
        decision: 'HOLD',
      },
      historicalLinkActiveAtDecision: true,
      currentActiveSourceLinkCount: 1,
      historicalActiveLinkCountAtDecision: 1,
      historicalLinkUniquenessEvidenceComplete: true,
      providerIdentity: 'DIMO',
      verifiedModality: null,
      telemetrySourceFamily: null,
      profileEvidenceInterpretation:
        VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
      decisionTimeRetrospectiveAssessable: false,
      profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
      profileRevision: 1,
      profileContentFingerprint: 'fp',
      profileLimitations: [],
      signals: [],
      consumerDemand: [
        {
          requirementId: 'req-lv',
          consumerModule: 'BATTERY',
          featureId: 'lv_read',
          canonicalSignalKeys: ['lv_voltage'],
          domainApprovalStatus: 'DOMAIN_APPROVED',
          demandClassification: VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT,
          assessmentStatus: 'SATISFIED',
          discrepancyReasons: ['LIMITED_HISTORICAL_RESEARCH_PREVIEW'],
        },
      ],
      evidenceLimitations: ['HISTORY_AS_OF_OFFLINE_REPLAY'],
      attributionStatus: 'RESOLVED' as const,
      shadowBindingStatus: VsiApdsShadowBindingStatus.MATCHED,
      shadowBindingReasons: [],
    };

    const correlation = correlateApdsShadowWithVsiCapability({
      decision: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        decisionAt: '2026-10-12T00:00:00.000Z',
        policyVersion: 'p25-apd-b4-v1',
        activationEpochId: null,
        baselineDecision: 'HOLD',
      },
      observation,
    });
    expect(correlation.matchingCapabilities).toHaveLength(0);
    expect(correlation.investigationHints).toContain(
      'LIMITED_HISTORICAL_RESEARCH_SATISFIED:req-lv',
    );
    expect(correlation.matchedVehicleLink).toBe(false);
  });

  it('scientific metrics keep verifiedDecisionTimeEvidence at zero for LIMITED rows', () => {
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
      historicalRevisionEvidence: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        limitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
        commitVisibilityProven: false,
      },
    };
    const m = buildP5b2HistoricalScientificMetrics([row]);
    expect(m.verifiedDecisionTimeEvidence).toBe(0);
    expect(m.priorRevisionFound).toBe(1);
  });
});
