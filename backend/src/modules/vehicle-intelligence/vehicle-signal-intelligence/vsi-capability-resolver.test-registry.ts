import {
  VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
  type VsiConsumerRequirementSpecV1,
  VsiConsumerModuleId as ModuleId,
  VsiDomainApprovalStatus,
} from './vsi-consumer-requirements.types';
import {
  type VsiFallbackChainSpecV1,
  VsiFallbackApprovalStatus,
} from './vsi-fallback-approval.registry';

/** Test-only requirements — never imported by production registry. */
export const VSI_CAPABILITY_RESOLVER_TEST_REQUIREMENTS: readonly VsiConsumerRequirementSpecV1[] =
  [
    {
      contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      consumerModule: ModuleId.DRIVING_INTELLIGENCE,
      featureId: 'fixture_approved_fallback',
      requirementId: 'di.fixture.accelerator_with_approved_fallback',
      canonicalSignalKeys: ['accelerator_pedal_position'],
      providerSourceLinkScoped: true,
      minimumEvidence: 'EMPIRICAL_OBSERVED',
      maxSignalAgeMs: 15 * 60 * 1000,
      minimumQuality: 'FRESH_AT_EVALUATION',
      historicalReliability: 'NONE',
      declaredOnlySufficient: false,
      requireAllSignalsTogether: false,
      fallbackChainId: 'vsi-fallback-fixture-domain-approved',
      domainOwner: 'VSI_TEST_FIXTURE_ONLY',
      domainApprovalStatus: VsiDomainApprovalStatus.APPROVED,
      evidenceReference: 'vsi-capability-resolver.engine.spec.ts',
    },
    {
      contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      consumerModule: ModuleId.APDS,
      featureId: 'fixture_runtime_eligible',
      requirementId: 'apds.fixture.runtime_approved',
      canonicalSignalKeys: ['provider_source_timestamp'],
      providerSourceLinkScoped: true,
      minimumEvidence: 'EMPIRICAL_OBSERVED',
      maxSignalAgeMs: 60 * 60 * 1000,
      minimumQuality: 'ANY_OBSERVED',
      historicalReliability: 'NONE',
      declaredOnlySufficient: false,
      requireAllSignalsTogether: false,
      fallbackChainId: null,
      domainOwner: 'VSI_TEST_FIXTURE_ONLY',
      domainApprovalStatus: VsiDomainApprovalStatus.APPROVED,
      evidenceReference: 'vsi-capability-resolver.engine.spec.ts',
    },
    {
      contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
      consumerModule: ModuleId.DRIVING_INTELLIGENCE,
      featureId: 'fixture_multi_signal',
      requirementId: 'di.fixture.multi_signal_together',
      canonicalSignalKeys: ['vehicle_speed', 'accelerator_pedal_position'],
      providerSourceLinkScoped: true,
      minimumEvidence: 'EMPIRICAL_OBSERVED',
      maxSignalAgeMs: 60 * 60 * 1000,
      minimumQuality: 'FRESH_AT_EVALUATION',
      historicalReliability: 'NONE',
      declaredOnlySufficient: false,
      requireAllSignalsTogether: true,
      fallbackChainId: null,
      domainOwner: 'VSI_TEST_FIXTURE_ONLY',
      domainApprovalStatus: VsiDomainApprovalStatus.APPROVED,
      evidenceReference: 'vsi-capability-resolver.engine.spec.ts',
    },
  ];

export const VSI_CAPABILITY_RESOLVER_TEST_FALLBACK_CHAINS: readonly VsiFallbackChainSpecV1[] =
  [
    {
      chainId: 'vsi-fallback-fixture-domain-approved',
      fromCanonicalSignalKey: 'accelerator_pedal_position',
      toCanonicalSignalKey: 'vehicle_speed',
      status: VsiFallbackApprovalStatus.PRODUCTION_VALIDATED,
      domainOwner: 'VSI_TEST_FIXTURE_ONLY',
      evidenceReference: 'vsi-capability-resolver.engine.spec.ts',
      semanticNotes: ['Fixture-only — not in production registry'],
    },
  ];
