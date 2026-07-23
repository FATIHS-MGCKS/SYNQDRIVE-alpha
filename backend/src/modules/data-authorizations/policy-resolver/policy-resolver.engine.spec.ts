import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  LegalBasisConsentRequirement,
  PrivacyEnforcementMode,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  POLICY_RESOLVER_ACTION,
  POLICY_RESOLVER_DECISION,
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from './policy-resolver.constants';
import type { PolicyResolverEvaluatedContext } from './policy-resolver.types';
import { buildPolicyResolverCandidate, resolvePolicyEngine } from './policy-resolver.engine';

const ORG = 'org-1';
const ACTIVITY = 'activity-1';
const VEHICLE = 'vehicle-1';
const NOW = '2026-07-23T12:00:00.000Z';

function baseContext(overrides: Partial<PolicyResolverEvaluatedContext> = {}): PolicyResolverEvaluatedContext {
  return {
    organizationId: ORG,
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
    dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
    purpose: PrivacyProcessingPurpose.LIVE_MAP,
    action: POLICY_RESOLVER_ACTION.READ,
    processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
    processorId: 'synqdrive-platform',
    resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
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

function activePolicy(overrides: Partial<ReturnType<typeof buildPolicyResolverCandidate>['enforcementPolicy']> = {}) {
  return buildPolicyResolverCandidate({
    enforcementPolicy: {
      id: 'policy-1',
      organizationId: ORG,
      policyFamilyId: 'fam-1',
      versionNumber: 1,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      enforcementMode: PrivacyEnforcementMode.ENFORCE,
      dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
      processingPurpose: PrivacyProcessingPurpose.LIVE_MAP,
      scopeType: 'VEHICLE',
      validFrom: new Date('2026-01-01'),
      validUntil: null,
      pathId: 'path-1',
      processingActivityId: ACTIVITY,
      ...overrides,
    },
    processingActivity: {
      id: ACTIVITY,
      organizationId: ORG,
      activityCode: 'fleet-gps',
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      validFrom: new Date('2026-01-01'),
      validUntil: null,
    },
    legalBasisAssessments: [
      {
        id: 'lba-1',
        organizationId: ORG,
        processingActivityId: ACTIVITY,
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        legalBasisType: PrivacyLegalBasisType.CONTRACT,
        consentRequirement: LegalBasisConsentRequirement.NOT_APPLICABLE,
        validFrom: new Date('2026-01-01'),
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

describe('policy-resolver.engine', () => {
  it('allows valid access when full stack is satisfied', () => {
    const result = resolvePolicyEngine({
      context: baseContext(),
      candidates: [activePolicy()],
    });
    expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.ALLOW);
    expect(result.matchedPolicy?.id).toBe('policy-1');
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.resolverVersion).toBe('1.0.0');
  });

  it('denies when legal basis is missing', () => {
    const candidate = activePolicy();
    candidate.legalBasisAssessments = [];
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.DENY);
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.LEGAL_BASIS_MISSING);
  });

  it('denies when consent is required but missing', () => {
    const candidate = activePolicy();
    candidate.legalBasisAssessments[0].legalBasisType = PrivacyLegalBasisType.CONSENT;
    candidate.legalBasisAssessments[0].consentRequirement =
      LegalBasisConsentRequirement.EXPLICIT_OPT_IN;
    const result = resolvePolicyEngine({
      context: baseContext({ dataSubjectReference: 'subject-ref-12345678' }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.CONSENT_MISSING);
  });

  it('denies when provider grant is expired', () => {
    const candidate = activePolicy();
    candidate.providerAccessGrants = [
      {
        id: 'grant-1',
        organizationId: ORG,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        processingActivityId: ACTIVITY,
        vehicleId: VEHICLE,
        grantedAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-06-01'),
        revokedAt: null,
        scopeKeys: ['telemetry'],
      },
    ];
    const result = resolvePolicyEngine({
      context: baseContext({
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
        processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
        processorId: 'DIMO',
      }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.PROVIDER_GRANT_EXPIRED);
  });

  it('denies on scope mismatch', () => {
    const candidate = activePolicy();
    candidate.scopeVehicleIds = ['other-vehicle'];
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.SCOPE_MISMATCH);
  });

  it('denies on foreign tenant mismatch', () => {
    const candidate = activePolicy({ organizationId: 'org-other' });
    candidate.processingActivity!.organizationId = 'org-other';
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.TENANT_MISMATCH);
  });

  it('returns conflict when multiple equally specific policies match', () => {
    const a = activePolicy({ id: 'policy-a', pathId: 'a' });
    const b = activePolicy({ id: 'policy-b', pathId: 'b', policyFamilyId: 'fam-2' });
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [a, b] });
    expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.CONFLICT);
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.POLICY_CONFLICT);
    expect(result.conflictingPolicyIds).toEqual(expect.arrayContaining(['policy-a', 'policy-b']));
  });

  it('denies suspended policy', () => {
    const candidate = activePolicy({ status: PrivacyPolicyLifecycleStatus.SUSPENDED });
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.POLICY_SUSPENDED);
  });

  it('denies revoked policy', () => {
    const candidate = activePolicy({ status: PrivacyPolicyLifecycleStatus.REVOKED });
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.POLICY_REVOKED);
  });

  it('denies future policy not yet valid', () => {
    const candidate = activePolicy({ validFrom: new Date('2027-01-01') });
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.POLICY_NOT_YET_VALID);
  });

  it('denies when DPIA evidence is missing for high-risk combination', () => {
    const candidate = activePolicy();
    candidate.enforcementPolicy.dataCategory = PrivacyProcessingDataCategory.GPS_LOCATION;
    candidate.enforcementPolicy.processingPurpose = PrivacyProcessingPurpose.FLEET_ANALYTICS;
    candidate.legalBasisAssessments[0].balancingTestReference = null;
    candidate.legalBasisAssessments[0].legalBasisType = PrivacyLegalBasisType.CONTRACT;
    const result = resolvePolicyEngine({
      context: baseContext({
        dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
        purpose: PrivacyProcessingPurpose.FLEET_ANALYTICS,
      }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_REQUIRED);
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPIA_MISSING);
  });

  it('denies when DPA is missing for external partner', () => {
    const candidate = activePolicy();
    const result = resolvePolicyEngine({
      context: baseContext({
        processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER,
        processorId: 'partner-acme',
        action: POLICY_RESOLVER_ACTION.SHARE,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.PARTNER_ACCESS,
      }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPA_MISSING);
  });

  it('denies third-country transfer without mechanism', () => {
    const candidate = activePolicy({
      dataCategory: PrivacyProcessingDataCategory.CUSTOMER_DATA,
      processingPurpose: PrivacyProcessingPurpose.PARTNER_SERVICE,
    });
    candidate.dataSharingAuthorizations = [
      {
        id: 'share-1',
        organizationId: ORG,
        processingActivityId: ACTIVITY,
        purpose: PrivacyProcessingPurpose.PARTNER_SERVICE,
        recipient: 'partner-us',
        status: DataSharingAuthorizationStatus.AUTHORIZED,
        transferCountry: 'US',
        transferMechanism: null,
        validFrom: new Date('2026-01-01'),
        validUntil: null,
        dataCategories: [PrivacyProcessingDataCategory.CUSTOMER_DATA],
      },
    ];
    const result = resolvePolicyEngine({
      context: baseContext({
        dataCategory: PrivacyProcessingDataCategory.CUSTOMER_DATA,
        purpose: PrivacyProcessingPurpose.PARTNER_SERVICE,
        processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER,
        processorId: 'partner-us',
        action: POLICY_RESOLVER_ACTION.SHARE,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.PARTNER_ACCESS,
      }),
      candidates: [candidate],
    });
    expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.TRANSFER_MECHANISM_REQUIRED);
  });

  it('returns SHADOW_WOULD_DENY in shadow mode with blocking reasons', () => {
    const candidate = activePolicy({ enforcementMode: PrivacyEnforcementMode.SHADOW });
    candidate.legalBasisAssessments = [];
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.SHADOW_WOULD_DENY);
  });

  it('allows in OFF mode despite blocking reasons', () => {
    const candidate = activePolicy({ enforcementMode: PrivacyEnforcementMode.OFF });
    candidate.legalBasisAssessments = [];
    const result = resolvePolicyEngine({ context: baseContext(), candidates: [candidate] });
    expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.ALLOW);
  });
});
