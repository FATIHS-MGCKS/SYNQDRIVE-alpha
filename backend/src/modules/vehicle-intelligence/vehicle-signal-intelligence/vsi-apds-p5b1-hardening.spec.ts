import { buildP5b1CorrelationEvidenceFingerprint } from './vsi-apds-p5b1-evidence-fingerprint';
import { buildP5b1ScientificProductMetrics } from './vsi-apds-p5b1-metrics';
import {
  parseP5b1OperatorScope,
  VsiApdsP5b1OperatorScopeError,
  validateP5b1ContinuationCursor,
} from './vsi-apds-p5b1-operator-scope';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';
import { P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

const window = {
  decisionAtFrom: new Date('2026-10-01T00:00:00.000Z'),
  decisionAtTo: new Date('2026-10-16T00:00:00.000Z'),
};

describe('vsi-apds-p5b1 hardening', () => {
  it('rejects missing organizationId', () => {
    expect(() =>
      parseP5b1OperatorScope({
        filter: { ...window },
        pagination: { limit: 10 },
        maxTotalDecisions: 100,
      }),
    ).toThrow(VsiApdsP5b1OperatorScopeError);
  });

  it('rejects invalid time window', () => {
    try {
      parseP5b1OperatorScope({
        filter: {
          organizationId: 'org-1',
          decisionAtFrom: window.decisionAtTo,
          decisionAtTo: window.decisionAtFrom,
        },
        pagination: { limit: 10 },
        maxTotalDecisions: 100,
      });
      fail('expected scope error');
    } catch (err) {
      expect(err).toBeInstanceOf(VsiApdsP5b1OperatorScopeError);
      expect((err as VsiApdsP5b1OperatorScopeError).code).toBe('DECISION_TIME_WINDOW_INVALID');
    }
  });

  it('rejects partial cursor', () => {
    try {
      validateP5b1ContinuationCursor({
        cursorDecisionAt: new Date(),
      });
      fail('expected cursor error');
    } catch (err) {
      expect(err).toBeInstanceOf(VsiApdsP5b1OperatorScopeError);
      expect((err as VsiApdsP5b1OperatorScopeError).code).toBe('CURSOR_INCOMPLETE');
    }
  });

  it('fingerprint changes when consumer assessment changes', () => {
    const base = {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        policyVersion: P25_APD_B4_V1,
        decisionAt: '2026-10-16T06:00:00.000Z',
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
      investigationHints: [],
      processingStatus: 'CORRELATED' as const,
      errorCode: null,
      skippedReason: null,
      correlation: null,
    };
    const rowA = {
      ...base,
      observation: {
        contractVersion: 'vsi-apds-p5-readonly-v1' as const,
        organizationId: 'org',
        vehicleId: 'veh',
        providerSourceLinkId: 'link',
        shadowOpportunityId: 'opp',
        shadowDecisionAt: '2026-10-16T06:00:00.000Z',
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        requirementsContractVersion: 'vsi-consumer-requirements-v1' as const,
        correlationAnalysisMode: 'VERIFIED_SHADOW_CORRELATION' as const,
        authoritativePersistedDecision: null,
        historicalLinkActiveAtDecision: true,
        currentActiveSourceLinkCount: 1,
        historicalActiveLinkCountAtDecision: 1,
        historicalLinkUniquenessEvidenceComplete: true,
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        profileEvidenceInterpretation: 'CURRENT_PROFILE_REVIEW' as const,
        decisionTimeRetrospectiveAssessable: false,
        profileContractVersion: 'vsi-signal-profile-v2',
        profileRevision: 1,
        profileContentFingerprint: 'fp',
        profileLimitations: [],
        signals: [],
        consumerDemand: [
          {
            requirementId: 'battery.lv',
            consumerModule: 'battery',
            featureId: 'lv',
            canonicalSignalKeys: ['lv_voltage'],
            domainApprovalStatus: 'APPROVED',
            demandClassification: VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT,
            assessmentStatus: 'SATISFIED' as const,
            discrepancyReasons: [],
          },
        ],
        evidenceLimitations: [],
        attributionStatus: 'RESOLVED' as const,
        shadowBindingStatus: 'MATCHED' as const,
        shadowBindingReasons: [],
      },
    };
    const rowB = {
      ...rowA,
      observation: {
        ...rowA.observation!,
        consumerDemand: [
          {
            ...rowA.observation!.consumerDemand[0],
            assessmentStatus: 'INSUFFICIENT' as const,
          },
        ],
      },
    };
    expect(buildP5b1CorrelationEvidenceFingerprint(rowA)).not.toEqual(
      buildP5b1CorrelationEvidenceFingerprint(rowB),
    );
  });

  it('separates declared from domain-approved demand and capability gap denominators', () => {
    const demandRow = (
      classification: (typeof VsiApdsDemandClassification)[keyof typeof VsiApdsDemandClassification],
      assessment: 'SATISFIED' | 'INSUFFICIENT' | 'NOT_ASSESSABLE' | 'UNKNOWN',
      id: string,
    ) => ({
      requirementId: id,
      consumerModule: 'battery',
      featureId: 'lv',
      canonicalSignalKeys: ['lv_voltage'],
      domainApprovalStatus: 'APPROVED',
      demandClassification: classification,
      assessmentStatus: assessment,
      discrepancyReasons: [],
    });
    const baseRow = {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        policyVersion: P25_APD_B4_V1,
        decisionAt: '2026-10-16T06:00:00.000Z',
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
      correlation: null,
      investigationHints: [],
      processingStatus: 'CORRELATED' as const,
      errorCode: null,
      skippedReason: null,
      observation: {
        contractVersion: 'vsi-apds-p5-readonly-v1' as const,
        organizationId: 'org',
        vehicleId: 'veh',
        providerSourceLinkId: 'link',
        shadowOpportunityId: 'opp',
        shadowDecisionAt: '2026-10-16T06:00:00.000Z',
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        requirementsContractVersion: 'vsi-consumer-requirements-v1' as const,
        correlationAnalysisMode: 'VERIFIED_SHADOW_CORRELATION' as const,
        authoritativePersistedDecision: null,
        historicalLinkActiveAtDecision: true,
        currentActiveSourceLinkCount: 1,
        historicalActiveLinkCountAtDecision: 1,
        historicalLinkUniquenessEvidenceComplete: true,
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        profileEvidenceInterpretation: 'VERIFIED_DECISION_TIME_SNAPSHOT' as const,
        decisionTimeRetrospectiveAssessable: true,
        profileContractVersion: 'vsi-signal-profile-v2',
        profileRevision: 1,
        profileContentFingerprint: 'fp',
        profileLimitations: [],
        signals: [],
        consumerDemand: [
          demandRow(VsiApdsDemandClassification.DECLARED_REQUIREMENT, 'SATISFIED', 'declared-1'),
          demandRow(VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT, 'INSUFFICIENT', 'appr-1'),
          demandRow(VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT, 'NOT_ASSESSABLE', 'appr-2'),
          demandRow(VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL, 'UNKNOWN', 'pend-1'),
        ],
        evidenceLimitations: [],
        attributionStatus: 'RESOLVED' as const,
        shadowBindingStatus: 'MATCHED' as const,
        shadowBindingReasons: [],
      },
    };
    const metrics = buildP5b1ScientificProductMetrics([baseRow]);
    expect(metrics.declaredConsumerDemand).toEqual({ numerator: 1, denominator: 1 });
    expect(metrics.domainApprovedConsumerDemand).toEqual({ numerator: 0, denominator: 1 });
    expect(metrics.genuineInsufficientCapability.battery).toEqual({
      numerator: 1,
      denominator: 1,
    });
    expect(metrics.notAssessableDueToApprovalOrEvidence.denominator).toBe(1);
    expect(metrics.pendingConsumerDemand.denominator).toBe(1);
  });

  it('does not count NOT_ASSESSABLE as genuine insufficient capability', () => {
    const row = {
      contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
      decisionIdentity: {
        organizationId: 'org',
        vehicleId: 'veh',
        opportunityId: 'opp',
        policyVersion: P25_APD_B4_V1,
        decisionAt: '2026-10-16T06:00:00.000Z',
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
        contractVersion: 'vsi-apds-p5-readonly-v1' as const,
        organizationId: 'org',
        vehicleId: 'veh',
        providerSourceLinkId: 'link',
        shadowOpportunityId: 'opp',
        shadowDecisionAt: '2026-10-16T06:00:00.000Z',
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        requirementsContractVersion: 'vsi-consumer-requirements-v1' as const,
        correlationAnalysisMode: 'VERIFIED_SHADOW_CORRELATION' as const,
        authoritativePersistedDecision: null,
        historicalLinkActiveAtDecision: true,
        currentActiveSourceLinkCount: 1,
        historicalActiveLinkCountAtDecision: 1,
        historicalLinkUniquenessEvidenceComplete: true,
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        profileEvidenceInterpretation: 'VERIFIED_DECISION_TIME_SNAPSHOT' as const,
        decisionTimeRetrospectiveAssessable: true,
        profileContractVersion: 'vsi-signal-profile-v2',
        profileRevision: 1,
        profileContentFingerprint: 'fp',
        profileLimitations: [],
        signals: [],
        consumerDemand: [
          {
            requirementId: 'battery.lv',
            consumerModule: 'battery',
            featureId: 'lv',
            canonicalSignalKeys: ['lv_voltage'],
            domainApprovalStatus: 'APPROVED',
            demandClassification: VsiApdsDemandClassification.DOMAIN_APPROVED_REQUIREMENT,
            assessmentStatus: 'NOT_ASSESSABLE' as const,
            discrepancyReasons: [],
          },
        ],
        evidenceLimitations: [],
        attributionStatus: 'RESOLVED' as const,
        shadowBindingStatus: 'MATCHED' as const,
        shadowBindingReasons: [],
      },
      correlation: null,
      investigationHints: [],
      processingStatus: 'CORRELATED' as const,
      errorCode: null,
      skippedReason: null,
    };
    const metrics = buildP5b1ScientificProductMetrics([row]);
    expect(metrics.genuineInsufficientCapability.battery?.numerator ?? 0).toBe(0);
    expect(metrics.notAssessableDueToApprovalOrEvidence.numerator).toBe(1);
  });
});
