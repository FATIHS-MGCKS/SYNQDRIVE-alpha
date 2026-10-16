import { buildVsiApdsReadonlyCapabilityObservation } from './vsi-apds-readonly.adapter';
import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
import { isVsiP5ApdsCorrelationEnabled } from './vsi-apds-p5.config';
import { VsiApdsDemandClassification } from './vsi-apds-p5.types';
import {
  apdsShadowBaselineParityIdentity,
  correlateApdsShadowWithVsiCapability,
} from './vsi-apds-shadow-correlation.engine';
import { VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION } from './vsi-consumer-requirements.types';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION, VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';

const evalAt = new Date('2026-10-16T12:00:00.000Z');

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

function adapter(overrides: Record<string, string> = {}) {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    shadowOpportunityId: 'opp-1',
    shadowDecisionAt: evalAt,
    requirementsContractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    ...overrides,
  };
}

describe('vsi-apds P5 read-only', () => {
  it('P5B gate default OFF', () => {
    expect(isVsiP5ApdsCorrelationEnabled()).toBe(false);
  });

  it('Ruptela R1: LV and GPS observed in inventory', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([
        { canonicalSignalKey: 'lv_voltage' },
        { canonicalSignalKey: 'vehicle_speed' },
        { canonicalSignalKey: 'position_coordinates' },
      ]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.signals.map((s) => s.canonicalSignalKey)).toEqual(
      expect.arrayContaining(['lv_voltage', 'vehicle_speed']),
    );
    const battery = obs.consumerDemand.find((d) => d.requirementId.includes('lv_voltage'));
    expect(battery?.demandClassification).toBe(VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL);
  });

  it('Tesla: HV observed, LV not observed', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([
        { canonicalSignalKey: 'hv_battery_soc' },
        { canonicalSignalKey: 'lv_voltage', empiricalObservation: 'NEVER_OBSERVED' },
      ]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    const lv = obs.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.empiricalObservation).toBe('NEVER_OBSERVED');
  });

  it('missing profile', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: null,
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.evidenceLimitations).toContain('PROFILE_NOT_FOUND');
    expect(obs.attributionStatus).toBe('UNKNOWN');
  });

  it('legacy v1 profile flagged', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: {
        ...profile([{ canonicalSignalKey: 'provider_source_timestamp' }]),
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION_V1,
      },
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.evidenceLimitations).toContain('LEGACY_PROFILE_V1');
  });

  it('pending domain approval listed as future demand not executable', () => {
    const demand = buildVsiConsumerDemandVectorV1({
      profile: profile([{ canonicalSignalKey: 'lv_voltage' }]),
      evaluationTimeMs: evalAt.getTime(),
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
    });
    const apds = demand.find((d) => d.requirementId === 'apds.profile_revision.correlation');
    expect(apds?.demandClassification).toBe(VsiApdsDemandClassification.DESIGN_CONTRACT_ONLY);
  });

  it('inactive link UNKNOWN attribution', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([{ canonicalSignalKey: 'lv_voltage' }]),
      linkActive: false,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.attributionStatus).toBe('UNKNOWN');
  });

  it('multi active links ambiguous', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile(
        [{ canonicalSignalKey: 'lv_voltage' }],
        ['MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS'],
      ),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.attributionStatus).toBe('UNKNOWN');
  });

  it('stale observation at decision time', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([
        {
          canonicalSignalKey: 'lv_voltage',
          lastSourceTimestamp: '2020-01-01T00:00:00.000Z',
        },
      ]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.signals[0]?.freshnessAtEvaluation).toBe('STALE');
  });

  it('correlation is not decision input', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([{ canonicalSignalKey: 'provider_source_timestamp' }]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    const result = correlateApdsShadowWithVsiCapability({
      decision: {
        opportunityId: 'opp-1',
        decisionAt: evalAt.toISOString(),
        policyVersion: 'p25-apd-b4-v1',
        baselineDecision: 'HOLD',
      },
      observation: obs,
    });
    expect(result.correlationIsDecisionInput).toBe(false);
    expect(result.originalApdsPolicyDecision).toBe('HOLD');
  });

  it('replay parity identity when correlation off', () => {
    const baseline = { decision: 'ENQUEUE', opportunityId: 'x' };
    expect(apdsShadowBaselineParityIdentity(baseline)).toEqual(baseline);
  });

  it('cross-tenant isolation', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([{ canonicalSignalKey: 'lv_voltage' }]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: false,
    });
    expect(obs.evidenceLimitations).toContain('TENANT_SCOPE_MISMATCH');
  });

  it('deterministic correlation', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    const decision = {
      opportunityId: 'opp-1',
      decisionAt: evalAt.toISOString(),
      policyVersion: 'p25-apd-b4-v1',
      baselineDecision: 'ENQUEUE',
    };
    const a = correlateApdsShadowWithVsiCapability({ decision, observation: obs });
    const b = correlateApdsShadowWithVsiCapability({ decision, observation: obs });
    expect(a).toEqual(b);
  });

  it('incomplete per-signal history surfaced on inventory rows', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([
        {
          canonicalSignalKey: 'odometer',
          observedCadenceMedianSeconds: null,
          observedSamples: null,
          limitations: ['PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT'],
        },
      ]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    const odo = obs.signals.find((s) => s.canonicalSignalKey === 'odometer');
    expect(odo?.limitations).toContain('PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT');
  });

  it('brake requirement without materialization stays NOT_ASSESSABLE (pending domain)', () => {
    const demand = buildVsiConsumerDemandVectorV1({
      profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]),
      evaluationTimeMs: evalAt.getTime(),
    });
    const brake = demand.find((d) => d.requirementId === 'di.brake_pedal_position.observed');
    expect(brake?.demandClassification).toBe(VsiApdsDemandClassification.PENDING_DOMAIN_APPROVAL);
    expect(brake?.assessmentStatus).toBe('NOT_ASSESSABLE');
    expect(brake?.canonicalSignalKeys).toEqual(['brake_pedal_position']);
  });

  it('does not substitute HV SOC for LV voltage in signal inventory', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile([{ canonicalSignalKey: 'hv_battery_soc' }]),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.signals.some((s) => s.canonicalSignalKey === 'lv_voltage')).toBe(false);
    expect(obs.signals.some((s) => s.canonicalSignalKey === 'hv_battery_soc')).toBe(true);
  });

  it('provider-source binding mismatch UNKNOWN attribution', () => {
    const obs = buildVsiApdsReadonlyCapabilityObservation({
      adapter: adapter(),
      profile: profile(
        [{ canonicalSignalKey: 'lv_voltage' }],
        ['PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY'],
      ),
      linkActive: true,
      linkSuperseded: false,
      tenantMatch: true,
    });
    expect(obs.attributionStatus).toBe('UNKNOWN');
  });

  it('correlation engine throws do not affect baseline parity helper', () => {
    expect(() =>
      apdsShadowBaselineParityIdentity({ opportunityId: 'o', decision: 'HOLD' }),
    ).not.toThrow();
  });
});
