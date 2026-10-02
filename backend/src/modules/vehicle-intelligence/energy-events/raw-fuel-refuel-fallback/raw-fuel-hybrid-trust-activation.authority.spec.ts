import type { RawRefuelCandidate } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV,
  combineAuthoritativeAndContextPromotionTrust,
  deriveEffectiveAbsoluteSignalTrust,
  evaluateHybridTrustActivationAuthorization,
  loadHybridTrustActivationConfig,
  parseHybridTrustActivationMode,
  parseHybridTrustActivationUuidAllowlist,
  resolveEffectivePromotionTrustForCandidate,
  resolveHybridTrustActivationDecision,
  resolvePromotionTimeHybridTrustDecision,
} from './raw-fuel-hybrid-trust-activation.authority';
import {
  buildHybridAbsoluteSignalTrustEvidence,
  mergeHybridAbsoluteSignalTrustEvidence,
} from './raw-fuel-hybrid-trust-evidence-metadata';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  evaluateFallbackPromotionAuthority,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import type { RawRefuelCandidateReadinessResult } from './raw-refuel-candidate-readiness.types';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';

const noNativeOverlap: RawRefuelNativeOverlapAdvisoryResult = {
  advisoryClassification: 'NO_NATIVE_SIBLINGS',
  siblingAssessments: [],
  sameNativeEventIds: [],
  distinctNativeEventIds: [],
  insufficientNativeEventIds: [],
  detail: 'none',
};

function readyReadiness(): RawRefuelCandidateReadinessResult {
  return {
    ready: true,
    detail: 'ready',
    reasonCode: 'READY',
    lifecycleState: 'READY_FOR_PERSIST',
  };
}

describe('raw-fuel-hybrid-trust-activation.authority', () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const vehicleA = randomUUID();
  const vehicleB = randomUUID();

  function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'OFF',
      [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: '',
      [RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV]: '',
      ...overrides,
    };
  }

  it('A1 mode absent => activation OFF', () => {
    const e = env();
    delete e[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV];
    const cfg = loadHybridTrustActivationConfig(e);
    expect(cfg.activationMode).toBe('OFF');
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgA,
      vehicleId: vehicleA,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(false);
    expect(decision.effectiveAbsoluteSignalTrust).toBe('UNKNOWN');
  });

  it('A2 malformed mode => OFF', () => {
    expect(parseHybridTrustActivationMode('BROKEN')).toBe('OFF');
    const cfg = loadHybridTrustActivationConfig(
      env({ [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'fleet-wide' }),
    );
    expect(cfg.activationMode).toBe('OFF');
  });

  it('A3 OFF + hybrid TRUSTED => effective UNKNOWN', () => {
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgA,
      computedHybridClassification: 'TRUSTED',
      config: loadHybridTrustActivationConfig(env()),
    });
    expect(decision.effectiveAbsoluteSignalTrust).toBe('UNKNOWN');
  });

  it('A4 ALPHA_ALLOWLIST + allowed organization + TRUSTED => effective TRUSTED', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
      }),
    );
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgA,
      vehicleId: vehicleA,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(true);
    expect(decision.activationScopeType).toBe('ORGANIZATION');
    expect(decision.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
  });

  it('A5 ALPHA_ALLOWLIST + non-allowed organization + TRUSTED => effective UNKNOWN', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
      }),
    );
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgB,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(false);
    expect(decision.effectiveAbsoluteSignalTrust).toBe('UNKNOWN');
  });

  it('A6 allowed organization + UNKNOWN => UNKNOWN', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
      }),
    );
    expect(
      resolveHybridTrustActivationDecision({
        organizationId: orgA,
        computedHybridClassification: 'UNKNOWN',
        config: cfg,
      }).effectiveAbsoluteSignalTrust,
    ).toBe('UNKNOWN');
  });

  it('A7 allowed organization + UNTRUSTED => promotion blocked', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
      }),
    );
    const effective = resolveHybridTrustActivationDecision({
      organizationId: orgA,
      computedHybridClassification: 'UNTRUSTED',
      config: cfg,
    }).effectiveAbsoluteSignalTrust;
    expect(effective).toBe('UNTRUSTED');
    const eligibility = evaluateRawRefuelPromotionEligibility(readyReadiness(), {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: effective,
      nativeOverlap: noNativeOverlap,
    });
    expect(eligibility.status).not.toBe('ELIGIBLE');
  });

  it('A8 empty allowlist => nobody authorized', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: '',
      }),
    );
    expect(
      resolveHybridTrustActivationDecision({
        organizationId: orgA,
        computedHybridClassification: 'TRUSTED',
        config: cfg,
      }).activationAuthorized,
    ).toBe(false);
  });

  it('A9 malformed allowlist => nobody authorized', () => {
    const parsed = parseHybridTrustActivationUuidAllowlist('not-a-uuid,also-bad');
    expect(parsed.parseValid).toBe(false);
    expect(parsed.ids.size).toBe(0);
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: 'not-a-uuid',
      }),
    );
    expect(cfg.allowedOrganizationIds.size).toBe(0);
    expect(cfg.organizationAllowlistParseValid).toBe(false);
    expect(
      resolveHybridTrustActivationDecision({
        organizationId: orgA,
        computedHybridClassification: 'TRUSTED',
        config: cfg,
      }).activationAuthorized,
    ).toBe(false);
  });

  it('A9b mixed valid + invalid org allowlist => entire list invalid, nobody authorized', () => {
    const parsed = parseHybridTrustActivationUuidAllowlist(`${orgA},not-a-uuid`);
    expect(parsed.parseValid).toBe(false);
    expect(parsed.ids.size).toBe(0);
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: `${orgA},not-a-uuid`,
      }),
    );
    expect(cfg.organizationAllowlistParseValid).toBe(false);
    expect(
      resolveHybridTrustActivationDecision({
        organizationId: orgA,
        computedHybridClassification: 'TRUSTED',
        config: cfg,
      }).activationAuthorized,
    ).toBe(false);
  });

  it('A10 organization mismatch + vehicle mismatch => blocked', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
        [RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV]: vehicleA,
      }),
    );
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgB,
      vehicleId: vehicleB,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(false);
  });

  it('A11 allowed vehicle override => authorized via VEHICLE scope when tenant consistent', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV]: vehicleA,
      }),
    );
    const hybridEvidence = mergeHybridAbsoluteSignalTrustEvidence(
      {},
      buildHybridAbsoluteSignalTrustEvidence(
        {
          authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
          classification: 'TRUSTED',
          reasonCode: 'CORROBORATED_RISE',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSampleCoverage: 'SUFFICIENT',
          baselineRecencyClassification: 'FRESH',
          absoluteDeltaLiters: 10,
          relativeDeltaPercent: 5,
          materialRiseLiters: 5,
          materialRisePercent: 5,
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
        {
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
      ),
    ) as RawRefuelCandidate['evidenceMeta'];
    const decision = resolvePromotionTimeHybridTrustDecision({
      candidate: {
        organizationId: orgA,
        vehicleId: vehicleA,
        evidenceMeta: hybridEvidence,
      },
      authoritativeVehicleOrganizationId: orgA,
      config: cfg,
    });
    expect(decision.tenantConsistent).toBe(true);
    expect(decision.activationAuthorized).toBe(true);
    expect(decision.activationScopeType).toBe('VEHICLE');
    expect(decision.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
  });

  it('A11b vehicle allowlist does not bypass tenant mismatch', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV]: vehicleA,
      }),
    );
    const hybridEvidence = mergeHybridAbsoluteSignalTrustEvidence(
      {},
      buildHybridAbsoluteSignalTrustEvidence(
        {
          authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
          classification: 'TRUSTED',
          reasonCode: 'CORROBORATED_RISE',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSampleCoverage: 'SUFFICIENT',
          baselineRecencyClassification: 'FRESH',
          absoluteDeltaLiters: 10,
          relativeDeltaPercent: 5,
          materialRiseLiters: 5,
          materialRisePercent: 5,
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
        {
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
      ),
    ) as RawRefuelCandidate['evidenceMeta'];
    const decision = resolvePromotionTimeHybridTrustDecision({
      candidate: {
        organizationId: orgB,
        vehicleId: vehicleA,
        evidenceMeta: hybridEvidence,
      },
      authoritativeVehicleOrganizationId: orgA,
      config: cfg,
    });
    expect(decision.tenantConsistent).toBe(false);
    expect(decision.effectiveAbsoluteSignalTrust).toBe('UNKNOWN');
  });

  it('A12 tenant isolation — org allowlist does not authorize other org vehicle context', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: orgA,
      }),
    );
    const decision = evaluateHybridTrustActivationAuthorization({
      organizationId: orgB,
      vehicleId: vehicleA,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(false);
  });

  it('deriveEffectiveAbsoluteSignalTrust contract', () => {
    expect(deriveEffectiveAbsoluteSignalTrust('TRUSTED', true)).toBe('TRUSTED');
    expect(deriveEffectiveAbsoluteSignalTrust('TRUSTED', false)).toBe('UNKNOWN');
    expect(deriveEffectiveAbsoluteSignalTrust('UNTRUSTED', true)).toBe('UNTRUSTED');
    expect(deriveEffectiveAbsoluteSignalTrust('UNKNOWN', true)).toBe('UNKNOWN');
  });

  it('A13 convergence gate OFF => no VEE even if hybrid TRUSTED + activated', () => {
    const prev = process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    const prevPromo = process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV];
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'false';
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
    expect(evaluateFallbackPromotionAuthority(process.env).authorized).toBe(false);
    if (prev === undefined) delete process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    else process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = prev;
    if (prevPromo === undefined) delete process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV];
    else process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = prevPromo;
  });

  it('A14 promotion execution gate OFF => no VEE', () => {
    const prevConv = process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    const prevPromo = process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV];
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'false';
    expect(evaluateFallbackPromotionAuthority(process.env).authorized).toBe(false);
    if (prevConv === undefined) delete process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    else process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = prevConv;
    if (prevPromo === undefined) delete process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV];
    else process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = prevPromo;
  });

  it('A15 stale baseline blocks promotion even when activated TRUSTED', () => {
    const notReady: RawRefuelCandidateReadinessResult = {
      ready: false,
      detail: 'not_ready',
      reasonCode: 'INSUFFICIENT_EVIDENCE',
      lifecycleState: 'READY_FOR_PERSIST',
    };
    const eligibility = evaluateRawRefuelPromotionEligibility(notReady, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: noNativeOverlap,
    });
    expect(eligibility.status).not.toBe('ELIGIBLE');
  });

  function hybridEvidenceMeta(computed: 'TRUSTED' | 'UNTRUSTED' | 'UNKNOWN') {
    return mergeHybridAbsoluteSignalTrustEvidence(
      {},
      buildHybridAbsoluteSignalTrustEvidence(
        {
          authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
          classification: computed,
          reasonCode:
            computed === 'UNTRUSTED'
              ? 'RELATIVE_CONTRADICTS_ABSOLUTE'
              : computed === 'TRUSTED'
                ? 'CORROBORATED_RISE'
                : 'RELATIVE_COVERAGE_INSUFFICIENT',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSampleCoverage: 'SUFFICIENT',
          baselineRecencyClassification: 'FRESH',
          absoluteDeltaLiters: 10,
          relativeDeltaPercent: 5,
          materialRiseLiters: 5,
          materialRisePercent: 5,
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
        {
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
      ),
    ) as RawRefuelCandidate['evidenceMeta'];
  }

  function alphaOrgCfg(allowedOrg: string) {
    return loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: allowedOrg,
      }),
    );
  }

  it('B1 caller context TRUSTED cannot elevate non-allowlisted hybrid TRUSTED candidate', () => {
    const cfg = alphaOrgCfg(orgA);
    const authoritative = resolvePromotionTimeHybridTrustDecision({
      candidate: {
        organizationId: orgB,
        vehicleId: vehicleB,
        evidenceMeta: hybridEvidenceMeta('TRUSTED'),
      },
      authoritativeVehicleOrganizationId: orgB,
      config: cfg,
    }).effectiveAbsoluteSignalTrust;
    expect(
      combineAuthoritativeAndContextPromotionTrust(authoritative, 'TRUSTED'),
    ).toBe('UNKNOWN');
  });

  it('B2 caller context TRUSTED cannot elevate hybrid UNKNOWN', () => {
    const cfg = alphaOrgCfg(orgA);
    const authoritative = resolvePromotionTimeHybridTrustDecision({
      candidate: {
        organizationId: orgA,
        vehicleId: vehicleA,
        evidenceMeta: hybridEvidenceMeta('UNKNOWN'),
      },
      authoritativeVehicleOrganizationId: orgA,
      config: cfg,
    }).effectiveAbsoluteSignalTrust;
    expect(
      combineAuthoritativeAndContextPromotionTrust(authoritative, 'TRUSTED'),
    ).toBe('UNKNOWN');
  });

  it('B3 caller context TRUSTED cannot elevate hybrid UNTRUSTED', () => {
    const cfg = alphaOrgCfg(orgA);
    const authoritative = resolvePromotionTimeHybridTrustDecision({
      candidate: {
        organizationId: orgA,
        vehicleId: vehicleA,
        evidenceMeta: hybridEvidenceMeta('UNTRUSTED'),
      },
      authoritativeVehicleOrganizationId: orgA,
      config: cfg,
    }).effectiveAbsoluteSignalTrust;
    expect(
      combineAuthoritativeAndContextPromotionTrust(authoritative, 'TRUSTED'),
    ).toBe('UNTRUSTED');
  });

  it('B4 stale row TRUSTED with missing hybrid provenance => no promotion trust', () => {
    expect(
      resolveEffectivePromotionTrustForCandidate(
        {
          organizationId: orgA,
          vehicleId: vehicleA,
          evidenceMeta: {},
          absoluteSignalTrust: 'TRUSTED',
        },
        alphaOrgCfg(orgA),
      ),
    ).toBe('UNKNOWN');
  });

  it('B5 stale row TRUSTED outside allowlist => no promotion trust', () => {
    expect(
      resolvePromotionTimeHybridTrustDecision({
        candidate: {
          organizationId: orgB,
          vehicleId: vehicleB,
          evidenceMeta: hybridEvidenceMeta('TRUSTED'),
        },
        authoritativeVehicleOrganizationId: orgB,
        config: alphaOrgCfg(orgA),
      }).effectiveAbsoluteSignalTrust,
    ).toBe('UNKNOWN');
  });

  it('B6 activation OFF before promotion blocks previously allowlisted hybrid TRUSTED', () => {
    const offCfg = loadHybridTrustActivationConfig(
      env({ [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'OFF' }),
    );
    expect(
      resolvePromotionTimeHybridTrustDecision({
        candidate: {
          organizationId: orgA,
          vehicleId: vehicleA,
          evidenceMeta: hybridEvidenceMeta('TRUSTED'),
        },
        authoritativeVehicleOrganizationId: orgA,
        config: offCfg,
      }).effectiveAbsoluteSignalTrust,
    ).toBe('UNKNOWN');
  });

  it('B7 allowlist changes from Org A to Org B before promotion', () => {
    const cfgB = alphaOrgCfg(orgB);
    expect(
      resolvePromotionTimeHybridTrustDecision({
        candidate: {
          organizationId: orgA,
          vehicleId: vehicleA,
          evidenceMeta: hybridEvidenceMeta('TRUSTED'),
        },
        authoritativeVehicleOrganizationId: orgA,
        config: cfgB,
      }).effectiveAbsoluteSignalTrust,
    ).toBe('UNKNOWN');
  });

  it('B8 candidate org/vehicle ownership mismatch => fail closed', () => {
    expect(
      resolvePromotionTimeHybridTrustDecision({
        candidate: {
          organizationId: orgA,
          vehicleId: vehicleA,
          evidenceMeta: hybridEvidenceMeta('TRUSTED'),
        },
        authoritativeVehicleOrganizationId: orgB,
        config: alphaOrgCfg(orgA),
      }),
    ).toMatchObject({ tenantConsistent: false, effectiveAbsoluteSignalTrust: 'UNKNOWN' });
  });

  it('combineAuthoritativeAndContextPromotionTrust stricter-only contract', () => {
    expect(combineAuthoritativeAndContextPromotionTrust('TRUSTED', 'TRUSTED')).toBe('TRUSTED');
    expect(combineAuthoritativeAndContextPromotionTrust('TRUSTED', undefined)).toBe('TRUSTED');
    expect(combineAuthoritativeAndContextPromotionTrust('UNKNOWN', 'TRUSTED')).toBe('UNKNOWN');
    expect(combineAuthoritativeAndContextPromotionTrust('UNTRUSTED', 'TRUSTED')).toBe('UNTRUSTED');
    expect(combineAuthoritativeAndContextPromotionTrust('TRUSTED', 'UNKNOWN')).toBe('UNKNOWN');
    expect(combineAuthoritativeAndContextPromotionTrust('TRUSTED', 'UNTRUSTED')).toBe('UNTRUSTED');
  });
});
