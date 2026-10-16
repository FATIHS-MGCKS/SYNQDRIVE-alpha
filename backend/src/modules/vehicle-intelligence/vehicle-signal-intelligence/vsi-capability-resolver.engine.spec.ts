import { resolveVsiCapabilities } from './vsi-capability-resolver.engine';
import {
  VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
  VsiConsumerModuleId,
} from './vsi-consumer-requirements.types';
import {
  VSI_CAPABILITY_RESOLVER_TEST_FALLBACK_CHAINS,
  VSI_CAPABILITY_RESOLVER_TEST_REQUIREMENTS,
} from './vsi-capability-resolver.test-registry';
import {
  VsiCapabilityResolutionStatus,
  VsiCapabilityResolverReasonCode,
  type VsiCapabilityResolverProfileContext,
} from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION, VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

const testRegistry = {
  requirements: VSI_CAPABILITY_RESOLVER_TEST_REQUIREMENTS,
  fallbackChains: VSI_CAPABILITY_RESOLVER_TEST_FALLBACK_CHAINS,
};

function v2Profile(
  signals: VsiCapabilityResolverProfileContext['signals'],
  limitations: string[] = [],
): VsiCapabilityResolverProfileContext {
  return {
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    profileRevision: 2,
    contentFingerprint: 'fp-test',
    profileLimitations: limitations,
    signals,
  };
}

function signal(
  key: string,
  overrides: Partial<VsiCapabilityResolverProfileContext['signals'][number]> = {},
) {
  return {
    canonicalSignalKey: key,
    declaredSupport: 'LISTED',
    empiricalObservation: 'OBSERVED',
    lastSourceTimestamp: new Date().toISOString(),
    lastValidObservationAt: new Date().toISOString(),
    freshnessClassification: 'FRESH',
    limitations: [],
    qualityClassification: 'OBSERVED_FRESH',
    confidenceLevel: 'HIGH',
    observedCadenceMedianSeconds: null,
    observedSamples: null,
    ...overrides,
  };
}

const baseInput = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  providerSourceLinkId: 'link-1',
  requirementsVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
};

describe('vsi-capability-resolver.engine', () => {
  it('Ruptela: fresh LV observed (pending domain still NOT_ASSESSABLE)', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.BATTERY_V2,
        featureId: 'lv_measurement_gate',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('lv_voltage')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL,
    );
  });

  it('Tesla: HV observed, LV absent', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.BATTERY_V2,
        featureId: 'hv_soc_readiness',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([
          signal('hv_battery_soc'),
          signal('lv_voltage', { empiricalObservation: 'NEVER_OBSERVED' }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
  });

  it('accelerator listed but absent in empirical axis', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'behavior_accelerator_evidence',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', {
            empiricalObservation: 'NEVER_OBSERVED',
            declaredSupport: 'LISTED',
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL,
    );
  });

  it('LISTED alone does not satisfy EMPIRICAL_OBSERVED (malformed empirical)', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date('2026-10-16T12:00:00.000Z'),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', {
            empiricalObservation: 'UNKNOWN_AXIS',
            declaredSupport: 'LISTED',
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.signalEvaluations[0]?.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_INSUFFICIENT,
    );
  });

  it('OBSERVED_STALE does not satisfy EMPIRICAL_OBSERVED', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date('2026-10-16T12:00:00.000Z'),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', {
            empiricalObservation: 'OBSERVED_STALE',
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.signalEvaluations[0]?.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.EMPIRICAL_OBSERVATION_STALE,
    );
  });

  it('brake requirement: domain pending (brake key not materialized in profile)', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'behavior_brake_evidence',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('vehicle_speed')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
  });

  it('legacy v1 profile is NOT_ASSESSABLE', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: {
          ...v2Profile([signal('provider_source_timestamp')]),
          profileContractVersion: VSI_PROFILE_CONTRACT_VERSION_V1,
        },
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.LEGACY_PROFILE_MISSING_P3_QUALITY,
    );
  });

  it('unsupported profile contract version', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: {
          ...v2Profile([signal('provider_source_timestamp')]),
          profileContractVersion: 'vsi-signal-profile-v99',
        },
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.UNSUPPORTED_PROFILE_CONTRACT_VERSION,
    );
  });

  it('missing profile', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: null,
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.INSUFFICIENT_EVIDENCE);
  });

  it('tenant mismatch UNKNOWN', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('provider_source_timestamp')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: false,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.UNKNOWN);
  });

  it('inactive link UNKNOWN', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('provider_source_timestamp')]),
        linkActive: false,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.UNKNOWN);
    expect(result.reasonCodes).toContain(VsiCapabilityResolverReasonCode.LINK_INACTIVE);
  });

  it('superseded link UNKNOWN', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('provider_source_timestamp')]),
        linkActive: true,
        linkSuperseded: true,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.reasonCodes).toContain(VsiCapabilityResolverReasonCode.LINK_SUPERSEDED);
  });

  it('multi active links with declared catalog ambiguous', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile(
          [signal('provider_source_timestamp')],
          ['MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS'],
        ),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 2,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.UNKNOWN);
    expect(result.reasonCodes).toContain(VsiCapabilityResolverReasonCode.DECLARED_CATALOG_AMBIGUOUS);
  });

  it('requirements version mismatch', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        requirementsVersion: 'vsi-consumer-requirements-v99' as typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('provider_source_timestamp')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.REQUIREMENTS_VERSION_MISMATCH,
    );
  });

  it('unapproved fallback denied', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'behavior_accelerator_evidence',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', { empiricalObservation: 'NEVER_OBSERVED' }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(
      result.fallbackPlan == null ||
        result.fallbackPlan.executable === false,
    ).toBe(true);
  });

  it('fixture approved fallback chain is not executable in P4 V1', () => {
    const staleTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', {
            empiricalObservation: 'NEVER_OBSERVED',
            lastSourceTimestamp: staleTs,
          }),
          signal('vehicle_speed', {
            lastSourceTimestamp: new Date().toISOString(),
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.fallbackPlan?.chainId).toBe('vsi-fallback-fixture-domain-approved');
    expect(result.fallbackPlan?.executable).toBe(false);
  });

  it('production registry has no fixture fallback chain', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('accelerator_pedal_position')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.limitations).toContain('NO_REQUIREMENTS_FOR_FEATURE');
  });

  it('deterministic: same inputs yield same decision', () => {
    const ctx = {
      profile: v2Profile([signal('provider_source_timestamp')]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
      activeSourceLinkCount: 1,
    };
    const input = {
      ...baseInput,
      consumerModule: VsiConsumerModuleId.APDS,
      featureId: 'shadow_demand_profile_read',
      evaluationTime: new Date('2026-10-16T12:00:00.000Z'),
    };
    const a = resolveVsiCapabilities(input, ctx);
    const b = resolveVsiCapabilities(input, ctx);
    expect(a).toEqual(b);
  });

  it('stale at evaluation time when max age enforced (fixture)', () => {
    const old = new Date('2020-01-01T00:00:00.000Z').toISOString();
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date('2026-10-16T12:00:00.000Z'),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', { lastSourceTimestamp: old }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.signalEvaluations[0]?.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.SIGNAL_STALE_AT_EVALUATION,
    );
  });

  it('future-dated signal timestamp rejected for FRESH_AT_EVALUATION', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_approved_fallback',
        evaluationTime: new Date('2026-10-16T12:00:00.000Z'),
      },
      {
        profile: v2Profile([
          signal('accelerator_pedal_position', {
            lastSourceTimestamp: '2030-01-01T00:00:00.000Z',
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.signalEvaluations[0]?.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.INVALID_SIGNAL_TIMESTAMP,
    );
  });

  it('partial multi-signal requirement fails closed', () => {
    const evalAt = new Date('2026-10-16T12:00:00.000Z');
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.DRIVING_INTELLIGENCE,
        featureId: 'fixture_multi_signal',
        evaluationTime: evalAt,
      },
      {
        profile: v2Profile([
          signal('vehicle_speed', { lastSourceTimestamp: evalAt.toISOString() }),
          signal('accelerator_pedal_position', {
            empiricalObservation: 'NEVER_OBSERVED',
            lastSourceTimestamp: evalAt.toISOString(),
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.resolutionStatus).toBe(
      VsiCapabilityResolutionStatus.INSUFFICIENT_EVIDENCE,
    );
  });

  it('missing P3 quality fields on required signal (pending domain feature)', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.BATTERY_V2,
        featureId: 'lv_measurement_gate',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([
          {
            ...signal('lv_voltage'),
            qualityClassification: undefined,
            confidenceLevel: undefined,
          },
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.LEGACY_PROFILE_MISSING_P3_QUALITY,
    );
  });

  it('APDS design approved + fresh signal → NOT_ASSESSABLE for runtime eligibility', () => {
    const evalAt = new Date('2026-10-16T12:00:00.000Z');
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'shadow_demand_profile_read',
        evaluationTime: evalAt,
      },
      {
        profile: v2Profile([
          signal('provider_source_timestamp', {
            lastSourceTimestamp: evalAt.toISOString(),
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.REQUIREMENT_RUNTIME_APPROVAL_ABSENT,
    );
    expect(result.signalEvaluations[0]?.empiricalObservation).toBe('OBSERVED');
  });

  it('runtime-approved test requirement → ELIGIBLE when evidence passes', () => {
    const evalAt = new Date('2026-10-16T12:00:00.000Z');
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.APDS,
        featureId: 'fixture_runtime_eligible',
        evaluationTime: evalAt,
      },
      {
        profile: v2Profile([
          signal('provider_source_timestamp', {
            lastSourceTimestamp: evalAt.toISOString(),
          }),
        ]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
      testRegistry,
    );
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.ELIGIBLE);
  });

  it('PENDING_DOMAIN_APPROVAL never ELIGIBLE', () => {
    const result = resolveVsiCapabilities(
      {
        ...baseInput,
        consumerModule: VsiConsumerModuleId.BATTERY_V2,
        featureId: 'lv_measurement_gate',
        evaluationTime: new Date(),
      },
      {
        profile: v2Profile([signal('lv_voltage')]),
        linkActive: true,
        linkSuperseded: false,
        tenantMatch: true,
        activeSourceLinkCount: 1,
      },
    );
    expect(result.resolutionStatus).not.toBe(VsiCapabilityResolutionStatus.ELIGIBLE);
    expect(result.reasonCodes).toContain(
      VsiCapabilityResolverReasonCode.REQUIREMENT_PENDING_DOMAIN_APPROVAL,
    );
  });
});
