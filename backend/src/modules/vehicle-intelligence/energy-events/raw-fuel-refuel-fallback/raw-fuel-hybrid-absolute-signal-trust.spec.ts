import { FuelType } from '@prisma/client';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  sampleAt,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import {
  evaluateHybridAbsoluteSignalTrust,
  RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
} from './raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE,
  RFRF_SIGNAL_TRUST_RESOLVER_VERSION,
  resolveRawFuelSignalTrust,
} from './raw-fuel-signal-trust.resolver';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import type { RawRefuelCandidateReadinessResult } from './raw-refuel-candidate-readiness.types';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';
import {
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { buildReadyEvidenceRefreshMeta } from './raw-refuel-ready-evidence-refresh-metadata';
import { evaluateReadyCandidateRefreshRequirement } from './raw-refuel-ready-evidence-refresh.policy';
import {
  buildWob20260927EventBCandidate,
  buildWob20260927EventBSamples,
} from './testing/wob-2026-09-19-stretched-end.fixture';

function readyReadiness(): RawRefuelCandidateReadinessResult {
  return {
    ready: true,
    detail: 'ready',
    reasonCode: 'READY',
    lifecycleState: 'READY_FOR_PERSIST',
  };
}

const windowStart = new Date('2026-09-27T21:17:16.923Z');
const windowEnd = new Date('2026-09-27T22:02:16.923Z');
const riseOnset = new Date('2026-09-27T21:34:16.923Z');
const riseEnd = new Date('2026-09-27T21:36:46.923Z');

const noNativeOverlap: RawRefuelNativeOverlapAdvisoryResult = {
  advisoryClassification: 'NO_NATIVE_SIBLINGS',
  siblingAssessments: [],
  sameNativeEventIds: [],
  distinctNativeEventIds: [],
  insufficientNativeEventIds: [],
  detail: 'none',
};

function freshObservationContext() {
  return {
    baselineRecencyClassification: 'FRESH' as const,
    riseOnsetAt: riseOnset,
    riseEndAt: riseEnd,
    preFuelAbsoluteLiters: 4,
    postFuelAbsoluteLiters: 13,
  };
}

function buildCorroboratedDualChannelSamples() {
  const preAbs = stablePlateauSamples('2026-09-27T21:30:46.923Z', 4, 3, 50, 'absolute');
  const preRel = stablePlateauSamples('2026-09-27T21:30:46.923Z', 8, 3, 50, 'relative');
  const rise = [
    sampleAt('2026-09-27T21:34:16.923Z', 6, 12),
    sampleAt('2026-09-27T21:35:30.000Z', 10, 18),
    sampleAt('2026-09-27T21:36:46.923Z', 13, 25),
  ];
  const postAbs = stablePlateauSamples('2026-09-27T21:37:30.000Z', 13, 5, 45, 'absolute');
  const postRel = stablePlateauSamples('2026-09-27T21:37:30.000Z', 25, 5, 45, 'relative');
  const merged = [...preAbs];
  for (let i = 0; i < preRel.length; i++) {
    merged[i] = {
      ...merged[i]!,
      relativePercent: preRel[i]!.relativePercent,
    };
  }
  for (const r of rise) merged.push(r);
  for (let i = 0; i < postAbs.length; i++) {
    merged.push({
      ...postAbs[i]!,
      relativePercent: postRel[i]!.relativePercent,
    });
  }
  return merged;
}

describe('Hybrid absolute signal trust authority v1', () => {
  it('T1 corroborated absolute + relative rise => TRUSTED (hybrid authority)', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).toBe('TRUSTED');
    expect(provenance.reasonCode).toBe('CORROBORATED_RISE');
  });

  it('T2 valid absolute rise without relative corroboration => UNKNOWN', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildWob20260927EventBSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).toBe('UNKNOWN');
    expect(provenance.reasonCode).toBe('RELATIVE_COVERAGE_INSUFFICIENT');
  });

  it('T3 partial relative coverage => UNKNOWN', () => {
    const samples = buildWob20260927EventBSamples().map((s, i) =>
      i < 2 ? { ...s, relativePercent: 8 } : s,
    );
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples,
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).toBe('UNKNOWN');
    expect(['RELATIVE_COVERAGE_INSUFFICIENT', 'INSUFFICIENT_CORROBORATION']).toContain(
      provenance.reasonCode,
    );
  });

  it('T4 absolute rise + contradictory relative fall => UNTRUSTED', () => {
    const preAbs = stablePlateauSamples('2026-09-27T21:30:46.923Z', 4, 3, 50, 'absolute');
    const preRel = stablePlateauSamples('2026-09-27T21:30:46.923Z', 40, 3, 50, 'relative');
    const rise = [
      sampleAt('2026-09-27T21:34:16.923Z', 12, 35),
      sampleAt('2026-09-27T21:36:46.923Z', 13, 8),
    ];
    const postAbs = stablePlateauSamples('2026-09-27T21:37:30.000Z', 13, 5, 45, 'absolute');
    const postRel = stablePlateauSamples('2026-09-27T21:37:30.000Z', 5, 5, 45, 'relative');
    const samples = [...preAbs];
    for (let i = 0; i < preRel.length; i++) {
      samples[i] = { ...samples[i]!, relativePercent: preRel[i]!.relativePercent };
    }
    samples.push(...rise);
    for (let i = 0; i < postAbs.length; i++) {
      samples.push({
        ...postAbs[i]!,
        relativePercent: postRel[i]!.relativePercent,
      });
    }
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples,
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).toBe('UNTRUSTED');
    expect(provenance.reasonCode).toBe('RELATIVE_CONTRADICTS_ABSOLUTE');
  });

  it('T5 malformed absolute => UNTRUSTED', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: [{ timestamp: new Date('2026-09-27T21:34:00.000Z'), absoluteLiters: -2 }],
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
    });
    expect(provenance.classification).toBe('UNTRUSTED');
    expect(provenance.absoluteDetectionAdmissibility).toBe('INADMISSIBLE');
  });

  it('T6 stale baseline => hybrid cannot TRUSTED', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: { ...freshObservationContext(), baselineRecencyClassification: 'STALE' },
    });
    expect(provenance.classification).toBe('UNKNOWN');
    expect(provenance.reasonCode).toBe('BASELINE_NOT_FRESH');
  });

  it('T7 missing baseline provenance => UNKNOWN', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: {
        riseOnsetAt: riseOnset,
        riseEndAt: riseEnd,
        preFuelAbsoluteLiters: 4,
        postFuelAbsoluteLiters: 13,
      },
    });
    expect(provenance.classification).toBe('UNKNOWN');
    expect(provenance.reasonCode).toBe('BASELINE_PROVENANCE_MISSING');
  });

  it('T8 old trustResolverVersion => REFRESH_REQUIRED', () => {
    const candidate = buildWob20260927EventBCandidate({
      evidenceMeta: {
        baselineRecency: buildBaselineRecencyEvidenceMeta({
          classification: 'FRESH',
          reason: 'test',
          bridgeGapSeconds: 100,
          prePlateauStartAt: riseOnset,
          prePlateauEndAt: riseOnset,
          riseOnsetAt: riseOnset,
          interveningPrimarySampleCount: 0,
          interveningContradictionCount: 0,
        }),
        readyEvidenceRefresh: {
          ...buildReadyEvidenceRefreshMeta({
            baselineRecencyClassification: 'FRESH',
            absoluteSignalTrust: 'UNKNOWN',
            absoluteDetectionAdmissibility: 'ADMISSIBLE',
            relativeSignalAvailable: true,
          }),
          trustResolverVersion: 'rfrf-signal-trust-v1',
        },
      } as never,
    });
    expect(evaluateReadyCandidateRefreshRequirement(candidate).status).toBe('REFRESH_REQUIRED');
  });

  it('T9 current trust version stamped => REFRESH_CURRENT on second evaluation', () => {
    const refresh = buildReadyEvidenceRefreshMeta({
      baselineRecencyClassification: 'FRESH',
      absoluteSignalTrust: 'UNKNOWN',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSignalAvailable: true,
      hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
      hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    });
    const candidate = buildWob20260927EventBCandidate({
      evidenceMeta: {
        baselineRecency: buildBaselineRecencyEvidenceMeta({
          classification: 'FRESH',
          reason: 'test',
          bridgeGapSeconds: 100,
          prePlateauStartAt: riseOnset,
          prePlateauEndAt: riseOnset,
          riseOnsetAt: riseOnset,
          interveningPrimarySampleCount: 0,
          interveningContradictionCount: 0,
        }),
        readyEvidenceRefresh: refresh,
      } as never,
    });
    expect(evaluateReadyCandidateRefreshRequirement(candidate).status).toBe('REFRESH_CURRENT');
  });

  it('T10 resolver gates TRUSTED while authority unavailable (promotion UNKNOWN)', () => {
    const hybrid = evaluateHybridAbsoluteSignalTrust({
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(hybrid.classification).toBe('TRUSTED');
    const resolved = resolveRawFuelSignalTrust({
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE).toBe(false);
    expect(resolved.absoluteSignalTrust).toBe('UNKNOWN');
    expect(resolved.hybridTrustProvenance.classification).toBe('TRUSTED');
  });

  it('T11 TRUSTED hybrid still blocked without F5 authorization', () => {
    const eligibility = evaluateRawRefuelPromotionEligibility(
      readyReadiness(),
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: noNativeOverlap,
        candidateEvidenceMeta: {
          baselineRecency: buildBaselineRecencyEvidenceMeta({
            classification: 'FRESH',
            reason: 'test',
            bridgeGapSeconds: 100,
            prePlateauStartAt: riseOnset,
            prePlateauEndAt: riseOnset,
            riseOnsetAt: riseOnset,
            interveningPrimarySampleCount: 0,
            interveningContradictionCount: 0,
          }),
        },
      },
      { [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false' },
    );
    expect(eligibility.status).toBe('BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED');
  });

  it('T12 TRUSTED still blocked on native SAME overlap', () => {
    const eligibility = evaluateRawRefuelPromotionEligibility(
      readyReadiness(),
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: { ...noNativeOverlap, advisoryClassification: 'SAME' },
        candidateEvidenceMeta: {
          baselineRecency: buildBaselineRecencyEvidenceMeta({
            classification: 'FRESH',
            reason: 'test',
            bridgeGapSeconds: 100,
            prePlateauStartAt: riseOnset,
            prePlateauEndAt: riseOnset,
            riseOnsetAt: riseOnset,
            interveningPrimarySampleCount: 0,
            interveningContradictionCount: 0,
          }),
        },
      },
      {
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      },
    );
    expect(eligibility.status).toBe('BLOCKED_NATIVE_OVERLAP_REVIEW');
  });

  it('T15 identical input => deterministic provenance', () => {
    const input = {
      samples: buildCorroboratedDualChannelSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    };
    const a = evaluateHybridAbsoluteSignalTrust(input);
    const b = evaluateHybridAbsoluteSignalTrust(input);
    expect(a).toEqual(b);
  });

  it('T16 contradictory evidence never TRUSTED', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildCorroboratedDualChannelSamples().map((s) => ({
        ...s,
        relativePercent: s.relativePercent != null ? 2 : null,
      })),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).not.toBe('TRUSTED');
  });

  it('T17 no evidence => UNKNOWN', () => {
    expect(evaluateHybridAbsoluteSignalTrust({}).classification).toBe('UNKNOWN');
  });

  it('T18 absolute presence only => UNKNOWN promotion output', () => {
    const resolved = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-27T21:34:00.000Z'), absoluteLiters: 42 }],
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
    });
    expect(resolved.absoluteSignalTrust).toBe('UNKNOWN');
    expect(resolved.hybridTrustProvenance.classification).not.toBe('TRUSTED');
  });

  it('T19 fuelType only => UNKNOWN', () => {
    expect(
      resolveRawFuelSignalTrust({ fuelType: FuelType.GASOLINE, samplePresenceOnly: true })
        .absoluteSignalTrust,
    ).toBe('UNKNOWN');
  });

  it('T20 detection ADMISSIBLE alone does not yield promotion TRUSTED', () => {
    const resolved = resolveRawFuelSignalTrust({
      samples: buildWob20260927EventBSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(resolved.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
    expect(resolved.absoluteSignalTrust).toBe('UNKNOWN');
  });

  it('WOB Event B read-only hybrid classification (fixture samples)', () => {
    const provenance = evaluateHybridAbsoluteSignalTrust({
      samples: buildWob20260927EventBSamples(),
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      observation: freshObservationContext(),
    });
    expect(provenance.classification).toBe('UNKNOWN');
    expect(provenance.reasonCode).toBe('RELATIVE_COVERAGE_INSUFFICIENT');
  });

  it('trust resolver version bumped to v2', () => {
    expect(RFRF_SIGNAL_TRUST_RESOLVER_VERSION).toBe('rfrf-signal-trust-v2');
  });
});

describe('Promotion trust firewall with hybrid resolver output', () => {
  it('T6 promotion blocked on stale baseline even if row trust TRUSTED', () => {
    const eligibility = evaluateRawRefuelPromotionEligibility(
      readyReadiness(),
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: noNativeOverlap,
        candidateEvidenceMeta: {
          baselineRecency: buildBaselineRecencyEvidenceMeta({
            classification: 'STALE',
            reason: 'stale',
            bridgeGapSeconds: 100,
            prePlateauStartAt: riseOnset,
            prePlateauEndAt: riseOnset,
            riseOnsetAt: riseOnset,
            interveningPrimarySampleCount: 1,
            interveningContradictionCount: 0,
          }),
        },
      },
      {
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      },
    );
    expect(eligibility.status).toBe('BLOCKED_BASELINE_RECENCY');
  });

  it('P1 UNKNOWN trust => BLOCKED_PROMOTION_TRUST', () => {
    const eligibility = evaluateRawRefuelPromotionEligibility(
      readyReadiness(),
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'UNKNOWN',
        nativeOverlap: noNativeOverlap,
        candidateEvidenceMeta: {
          baselineRecency: buildBaselineRecencyEvidenceMeta({
            classification: 'FRESH',
            reason: 'test',
            bridgeGapSeconds: 100,
            prePlateauStartAt: riseOnset,
            prePlateauEndAt: riseOnset,
            riseOnsetAt: riseOnset,
            interveningPrimarySampleCount: 0,
            interveningContradictionCount: 0,
          }),
        },
      },
      {
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      },
    );
    expect(eligibility.status).toBe('BLOCKED_PROMOTION_TRUST');
  });
});
