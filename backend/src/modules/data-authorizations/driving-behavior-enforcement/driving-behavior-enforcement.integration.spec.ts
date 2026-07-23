import {
  PrivacyLegalBasisType,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';
import {
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import type { PolicyResolverEvaluatedContext } from '../policy-resolver/policy-resolver.types';
import { buildPolicyResolverCandidate, resolvePolicyEngine } from '../policy-resolver/policy-resolver.engine';

const ORG = 'org-driving-behavior';
const ACTIVITY = 'activity-driving-behavior';
const VEHICLE = 'veh-1';
const NOW = '2026-07-23T12:00:00.000Z';

function baseContext(
  overrides: Partial<PolicyResolverEvaluatedContext> = {},
): PolicyResolverEvaluatedContext {
  return {
    organizationId: ORG,
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategory: PrivacyProcessingDataCategory.DRIVING_BEHAVIOR,
    purpose: PrivacyProcessingPurpose.ABUSE_MISUSE_DETECTION,
    action: 'PROCESS' as PolicyResolverEvaluatedContext['action'],
    processorType: 'SYNQDRIVE' as PolicyResolverEvaluatedContext['processorType'],
    processorId: 'synqdrive-misuse-reconcile',
    resourceType: 'VEHICLE',
    resourceId: VEHICLE,
    stationId: null,
    customerId: null,
    bookingId: null,
    vehicleId: VEHICLE,
    dataSubjectReference: null,
    effectiveTimestamp: NOW,
    ...overrides,
  };
}

function drivingBehaviorPolicy(
  purpose: PrivacyProcessingPurpose = PrivacyProcessingPurpose.ABUSE_MISUSE_DETECTION,
) {
  return buildPolicyResolverCandidate({
    enforcementPolicy: {
      id: 'policy-driving-behavior',
      organizationId: ORG,
      policyFamilyId: 'fam-db',
      versionNumber: 1,
      status: 'ACTIVE',
      enforcementMode: 'ENFORCE',
      dataCategory: PrivacyProcessingDataCategory.DRIVING_BEHAVIOR,
      processingPurpose: purpose,
      scopeType: 'VEHICLE',
      validFrom: new Date('2020-01-01'),
      validUntil: null,
      pathId: 'path-db',
      processingActivityId: ACTIVITY,
    },
    processingActivity: {
      id: ACTIVITY,
      organizationId: ORG,
      activityCode: 'driving-behavior',
      status: 'ACTIVE',
      validFrom: new Date('2020-01-01'),
      validUntil: null,
    },
    legalBasisAssessments: [
      {
        id: 'lba-db',
        organizationId: ORG,
        processingActivityId: ACTIVITY,
        status: 'ACTIVE',
        legalBasisType: PrivacyLegalBasisType.LEGITIMATE_INTERESTS,
        consentRequirement: 'NOT_APPLICABLE',
        validFrom: new Date('2020-01-01'),
        validUntil: null,
        balancingTestReference: null,
        isCurrentVersion: true,
        versionNumber: 1,
        evidenceReferences: [],
      },
    ],
    scopeVehicleIds: [VEHICLE],
  });
}

describe('Driving behavior DPIA integration', () => {
  it('denies misuse profiling when DPIA evidence is missing', () => {
    const candidate = drivingBehaviorPolicy();
    // LEGITIMATE_INTERESTS auto-satisfies DPIA in resolver — use CONTRACT to test missing evidence.
    candidate.legalBasisAssessments[0].legalBasisType = PrivacyLegalBasisType.CONTRACT;
    const result = resolvePolicyEngine({
      context: baseContext(),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_REQUIRED);
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_MISSING);
  });

  it('denies driver profiling (RENTAL_ANALYTICS) when DPIA evidence is missing', () => {
    const candidate = drivingBehaviorPolicy(PrivacyProcessingPurpose.RENTAL_ANALYTICS);
    candidate.legalBasisAssessments[0].legalBasisType = PrivacyLegalBasisType.CONTRACT;
    const result = resolvePolicyEngine({
      context: baseContext({ purpose: PrivacyProcessingPurpose.RENTAL_ANALYTICS }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_REQUIRED);
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_MISSING);
  });

  it('allows misuse profiling when DPIA evidence is present', () => {
    const candidate = drivingBehaviorPolicy();
    candidate.legalBasisAssessments[0].evidenceReferences = ['dpia-driving-behavior-2026'];
    const result = resolvePolicyEngine({
      context: baseContext(),
      candidates: [candidate],
    });
    expect(result.blockingReasons).not.toContain(POLICY_RESOLVER_REASON.DPIA_MISSING);
  });
});
