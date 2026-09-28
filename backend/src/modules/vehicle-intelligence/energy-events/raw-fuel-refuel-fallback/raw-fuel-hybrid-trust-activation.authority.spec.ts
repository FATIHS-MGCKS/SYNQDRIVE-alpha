import { randomUUID } from 'crypto';
import {
  RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV,
  deriveEffectiveAbsoluteSignalTrust,
  evaluateHybridTrustActivationAuthorization,
  loadHybridTrustActivationConfig,
  parseHybridTrustActivationMode,
  parseHybridTrustActivationUuidAllowlist,
  resolveHybridTrustActivationDecision,
} from './raw-fuel-hybrid-trust-activation.authority';
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
    expect(parseHybridTrustActivationUuidAllowlist('not-a-uuid,also-bad').size).toBe(0);
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV]: 'not-a-uuid',
      }),
    );
    expect(cfg.allowedOrganizationIds.size).toBe(0);
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

  it('A11 allowed vehicle override => authorized via VEHICLE scope', () => {
    const cfg = loadHybridTrustActivationConfig(
      env({
        [RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]: 'ALPHA_ALLOWLIST',
        [RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV]: vehicleA,
      }),
    );
    const decision = resolveHybridTrustActivationDecision({
      organizationId: orgB,
      vehicleId: vehicleA,
      computedHybridClassification: 'TRUSTED',
      config: cfg,
    });
    expect(decision.activationAuthorized).toBe(true);
    expect(decision.activationScopeType).toBe('VEHICLE');
    expect(decision.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
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
});
