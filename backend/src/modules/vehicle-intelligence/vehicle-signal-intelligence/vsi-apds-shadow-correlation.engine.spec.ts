import { buildVsiApdsReadonlyCapabilityObservation } from './vsi-apds-readonly.adapter';
import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
import { isVsiP5ApdsCorrelationEnabled } from './vsi-apds-p5.config';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { describeVsiApdsShadowRuntimeDiff } from './vsi-apds-parity-evidence';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';
import {
  apdsShadowBaselineParityIdentity,
  correlateApdsShadowWithVsiCapability,
} from './vsi-apds-shadow-correlation.engine';
import {
  VsiApdsCorrelationAnalysisMode,
  VsiApdsShadowBindingStatus,
} from './vsi-apds-shadow-opportunity-binding';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION, VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

const evalAt = new Date('2026-10-16T06:00:00.000Z');
const policyVersion = 'p25-apd-b4-v1';

function profile(
  signals: Array<
    Partial<VsiCapabilityResolverProfileContext['signals'][number]> & {
      canonicalSignalKey: string;
    }
  >,
  limitations: string[] = [],
): VsiCapabilityResolverProfileContext {
  return {
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    profileRevision: 3,
    contentFingerprint: 'fp-p5',
    profileLimitations: limitations,
    signals: signals.map((s) => ({
      declaredSupport: 'LISTED',
      empiricalObservation: 'OBSERVED',
      lastSourceTimestamp: evalAt.toISOString(),
      lastValidObservationAt: evalAt.toISOString(),
      freshnessClassification: 'FRESH',
      limitations: [],
      qualityClassification: 'OBSERVED_FRESH',
      confidenceLevel: 'HIGH',
      observedCadenceMedianSeconds: null,
      observedSamples: null,
      ...s,
    })),
  };
}

function temporalAt(d: Date, revision = 3) {
  return { evaluatedAt: d, createdAt: d, updatedAt: d, profileRevision: revision };
}

function adapter(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    shadowOpportunityId: 'opp-1',
    shadowDecisionAt: evalAt,
    policyVersion,
    requirementsContractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    ...overrides,
  };
}

const persistedDecision = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  opportunityId: 'opp-1',
  decisionAt: evalAt,
  policyVersion,
  activationEpochId: 'epoch-1',
  decision: 'HOLD',
};

function obsInput(
  partial: Partial<Parameters<typeof buildVsiApdsReadonlyCapabilityObservation>[0]> = {},
) {
  const prof = partial.profile ?? profile([{ canonicalSignalKey: 'lv_voltage' }]);
  return buildVsiApdsReadonlyCapabilityObservation({
    adapter: adapter({ activationEpochId: 'epoch-1' }),
    profile: prof,
    profileTemporal: temporalAt(evalAt),
    trustedProviderIdentity: 'DIMO',
    trustedVerifiedModality: 'RUPTELA_R1',
    trustedTelemetrySourceFamily: 'AFTERMARKET_OBD',
    linkActive: true,
    linkSuperseded: false,
    tenantMatch: true,
    currentActiveSourceLinkCount: 1,
    historicalActiveLinkCountAtDecision: 1,
    historicalLinkUniquenessEvidenceComplete: true,
    persistedShadowDecision: persistedDecision,
    historicalLinkActiveAtDecision: true,
    correlationAnalysisMode: VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
    ...partial,
  });
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    opportunityId: 'opp-1',
    decisionAt: evalAt.toISOString(),
    policyVersion,
    activationEpochId: 'epoch-1',
    baselineDecision: 'HOLD',
    ...overrides,
  };
}

const demandDefaults = {
  attributionUnknown: false,
  failClosed: false,
  decisionTimeRetrospectiveAssessable: true,
};

describe('vsi-apds P5 read-only', () => {
  it('P5B gate default OFF', () => {
    expect(isVsiP5ApdsCorrelationEnabled()).toBe(false);
  });

  it('honest APDS parity evidence — no independent replay in P5', () => {
    const e = describeVsiApdsShadowRuntimeDiff();
    expect(e.apdsRuntimeDiff).toBe('NONE');
    expect(e.p5bEnabled).toBe(false);
    expect(apdsShadowBaselineParityIdentity({ x: 1 })).toEqual({ x: 1 });
  });

  it('Ruptela R1: LV and GPS observed in inventory', () => {
    const obs = obsInput({
      profile: profile([
        { canonicalSignalKey: 'lv_voltage' },
        { canonicalSignalKey: 'vehicle_speed' },
        { canonicalSignalKey: 'position_coordinates' },
      ]),
    });
    expect(obs.signals.map((s) => s.canonicalSignalKey)).toEqual(
      expect.arrayContaining(['lv_voltage', 'vehicle_speed']),
    );
    expect(obs.verifiedModality).toBe('RUPTELA_R1');
    const battery = obs.consumerDemand.find((d) => d.requirementId.includes('lv_voltage'));
    expect(battery?.demandClassification).toBe(VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL);
  });

  it('Tesla: HV observed, LV not observed', () => {
    const obs = obsInput({
      profile: profile([
        { canonicalSignalKey: 'hv_battery_soc' },
        { canonicalSignalKey: 'lv_voltage', empiricalObservation: 'NEVER_OBSERVED' },
      ]),
      trustedVerifiedModality: 'TESLA_SOFTWARE',
      trustedTelemetrySourceFamily: 'OEM_API',
    });
    const lv = obs.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.empiricalObservation).toBe('NEVER_OBSERVED');
  });

  it('missing profile', () => {
    const obs = obsInput({ profile: null, profileTemporal: null });
    expect(obs.evidenceLimitations).toContain('PROFILE_NOT_FOUND');
    expect(obs.attributionStatus).toBe('UNKNOWN');
    expect(obs.profileEvidenceInterpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });

  it('legacy v1 profile flagged', () => {
    const obs = obsInput({
      profile: {
        ...profile([{ canonicalSignalKey: 'provider_source_timestamp' }]),
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION_V1,
      },
    });
    expect(obs.evidenceLimitations).toContain('LEGACY_PROFILE_V1');
    expect(obs.decisionTimeRetrospectiveAssessable).toBe(false);
  });

  it('pending domain approval listed as future demand not executable', () => {
    const demand = buildVsiConsumerDemandVectorV1({
      profile: profile([{ canonicalSignalKey: 'lv_voltage' }]),
      evaluationTimeMs: evalAt.getTime(),
      ...demandDefaults,
    });
    const pending = demand.filter(
      (d) => d.demandClassification === VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL,
    );
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((p) => p.assessmentStatus === 'NOT_ASSESSABLE')).toBe(true);
  });

  it('APDS design-only approval', () => {
    const demand = buildVsiConsumerDemandVectorV1({
      profile: profile([{ canonicalSignalKey: 'provider_source_timestamp' }]),
      evaluationTimeMs: evalAt.getTime(),
      ...demandDefaults,
    });
    const apds = demand.find((d) => d.requirementId === 'apds.profile_revision.correlation');
    expect(apds?.demandClassification).toBe(VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY);
  });

  it('inactive link UNKNOWN attribution', () => {
    const obs = obsInput({ linkActive: false });
    expect(obs.attributionStatus).toBe('UNKNOWN');
    expect(obs.signals).toHaveLength(0);
  });

  it('multi active links ambiguous', () => {
    const obs = obsInput({
      profile: profile(
        [{ canonicalSignalKey: 'lv_voltage' }],
        ['MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS'],
      ),
      currentActiveSourceLinkCount: 1,
      historicalActiveLinkCountAtDecision: 2,
    });
    expect(obs.attributionStatus).toBe('UNKNOWN');
    expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
  });

  it('stale observation at decision time', () => {
    const obs = obsInput({
      profile: profile([
        {
          canonicalSignalKey: 'lv_voltage',
          lastSourceTimestamp: '2020-01-01T00:00:00.000Z',
        },
      ]),
    });
    expect(obs.signals[0]?.freshnessAtEvaluation).toBe('STALE');
  });

  it('profile updated after decision → CURRENT_PROFILE_REVIEW not retrospective', () => {
    const obs = obsInput({
      profileTemporal: {
        evaluatedAt: new Date('2026-10-16T11:00:00.000Z'),
        createdAt: new Date('2026-10-16T10:00:00.000Z'),
        updatedAt: new Date('2026-10-16T07:00:00.000Z'),
        profileRevision: 4,
      },
    });
    expect(obs.profileEvidenceInterpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW,
    );
    expect(obs.decisionTimeRetrospectiveAssessable).toBe(false);
  });

  it('correlation is not decision input', () => {
    const obs = obsInput({
      profile: profile([{ canonicalSignalKey: 'provider_source_timestamp' }]),
    });
    const result = correlateApdsShadowWithVsiCapability({
      decision: decision(),
      observation: obs,
    });
    expect(result.correlationIsDecisionInput).toBe(false);
    expect(result.originalApdsPolicyDecision).toBe('HOLD');
  });

  it('cross-tenant isolation hides signal payloads', () => {
    const obs = obsInput({ tenantMatch: false });
    expect(obs.evidenceLimitations).toContain('TENANT_SCOPE_MISMATCH');
    expect(obs.signals).toHaveLength(0);
    expect(obs.consumerDemand.every((d) => d.assessmentStatus === 'UNKNOWN')).toBe(true);
  });

  it('deterministic correlation', () => {
    const obs = obsInput({ profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]) });
    const a = correlateApdsShadowWithVsiCapability({ decision: decision(), observation: obs });
    const b = correlateApdsShadowWithVsiCapability({ decision: decision(), observation: obs });
    expect(a).toEqual(b);
  });

  it('brake requirement without materialization stays NOT_ASSESSABLE (pending domain)', () => {
    const demand = buildVsiConsumerDemandVectorV1({
      profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]),
      evaluationTimeMs: evalAt.getTime(),
      ...demandDefaults,
    });
    const brake = demand.find((d) => d.requirementId === 'di.brake_pedal_position.observed');
    expect(brake?.demandClassification).toBe(VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL);
    expect(brake?.assessmentStatus).toBe('NOT_ASSESSABLE');
  });

  it('does not substitute HV SOC for LV voltage in signal inventory', () => {
    const obs = obsInput({ profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]) });
    expect(obs.signals.some((s) => s.canonicalSignalKey === 'lv_voltage')).toBe(false);
  });

  it('provider-source binding mismatch UNKNOWN attribution', () => {
    const obs = obsInput({
      profile: profile(
        [{ canonicalSignalKey: 'lv_voltage' }],
        ['PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY'],
      ),
    });
    expect(obs.attributionStatus).toBe('UNKNOWN');
  });

  it('missing persisted APDS decision never MATCHED', () => {
    const obs = obsInput({ persistedShadowDecision: null });
    expect(obs.shadowBindingStatus).toBe(
      VsiApdsShadowBindingStatus.MISSING_PERSISTED_DECISION,
    );
  });

  it('persisted APDS row mismatch rejects binding', () => {
    const obs = obsInput({
      persistedShadowDecision: {
        ...persistedDecision,
        opportunityId: 'opp-other',
      },
    });
    expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
  });

  it('correlation pair mismatch rejects matchedVehicleLink', () => {
    const obs = obsInput();
    const result = correlateApdsShadowWithVsiCapability({
      decision: decision({ opportunityId: 'opp-wrong', baselineDecision: 'HOLD' }),
      observation: obs,
    });
    expect(result.matchedVehicleLink).toBe(false);
    expect(result.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
  });
});
