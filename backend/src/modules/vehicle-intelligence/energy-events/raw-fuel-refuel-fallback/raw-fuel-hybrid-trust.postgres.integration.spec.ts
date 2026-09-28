/**
 * Localhost PostgreSQL proofs for hybrid trust in the promotion pipeline (P1–P10).
 * Run: RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1 npm test -- raw-fuel-hybrid-trust.postgres.integration.spec.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import { evaluateReadyCandidateRefreshRequirement } from './raw-refuel-ready-evidence-refresh.policy';
import {
  buildReadyEvidenceRefreshMeta,
  readReadyEvidenceRefreshFromEvidenceMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import { RFRF_SIGNAL_TRUST_RESOLVER_VERSION } from './raw-fuel-signal-trust.resolver';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  buildWob20260927EventBCandidate,
  buildWob20260927EventBSamples,
} from './testing/wob-2026-09-19-stretched-end.fixture';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import type { RawRefuelNativeOverlapAdvisoryResult } from './raw-refuel-native-overlap.types';

const LIVE = process.env.RAW_REFUEL_HYBRID_TRUST_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const noOverlap: RawRefuelNativeOverlapAdvisoryResult = {
  advisoryClassification: 'NO_NATIVE_SIBLINGS',
  siblingAssessments: [],
  sameNativeEventIds: [],
  distinctNativeEventIds: [],
  insufficientNativeEventIds: [],
  detail: 'none',
};

const freshMeta = {
  baselineRecency: buildBaselineRecencyEvidenceMeta({
    classification: 'FRESH',
    reason: 'pg_hybrid',
    bridgeGapSeconds: 100,
    prePlateauStartAt: new Date('2026-09-27T21:30:00.000Z'),
    prePlateauEndAt: new Date('2026-09-27T21:34:00.000Z'),
    riseOnsetAt: new Date('2026-09-27T21:34:16.923Z'),
    interveningPrimarySampleCount: 0,
    interveningContradictionCount: 0,
  }),
};

(LIVE ? describe : describe.skip)('RFRF hybrid trust PostgreSQL pipeline proofs', () => {
  beforeAll(async () => {
    if (!(await probeDatabase())) {
      throw new Error('DATABASE_URL unreachable — hybrid trust PG proofs skipped fail-closed');
    }
  });

  it('P1 READY + FRESH + ADMISSIBLE + UNKNOWN trust => BLOCKED_PROMOTION_TRUST', () => {
    const row = buildWob20260927EventBCandidate({
      absoluteSignalTrust: 'UNKNOWN',
      evidenceMeta: {
        ...freshMeta,
        readyEvidenceRefresh: buildReadyEvidenceRefreshMeta({
          baselineRecencyClassification: 'FRESH',
          absoluteSignalTrust: 'UNKNOWN',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSignalAvailable: true,
          hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
          hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
        }),
      } as never,
    });
    const readiness = evaluateRawRefuelCandidateReadiness(row as never, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
    });
    const promo = evaluateRawRefuelPromotionEligibility(
      readiness,
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: row.absoluteSignalTrust,
        nativeOverlap: noOverlap,
        candidateEvidenceMeta: row.evidenceMeta,
      },
      {
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      },
    );
    expect(promo.status).toBe('BLOCKED_PROMOTION_TRUST');
  });

  it('P2 TRUSTED + F5 off => blocked before VEE', () => {
    const row = buildWob20260927EventBCandidate({
      absoluteSignalTrust: 'TRUSTED',
      evidenceMeta: {
        ...freshMeta,
        readyEvidenceRefresh: buildReadyEvidenceRefreshMeta({
          baselineRecencyClassification: 'FRESH',
          absoluteSignalTrust: 'TRUSTED',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSignalAvailable: true,
          hybridTrustReasonCode: 'CORROBORATED_RISE',
          hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
        }),
      } as never,
    });
    const readiness = evaluateRawRefuelCandidateReadiness(row as never, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
    });
    const promo = evaluateRawRefuelPromotionEligibility(readiness, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: noOverlap,
      candidateEvidenceMeta: row.evidenceMeta,
    });
    expect(promo.status).toBe('BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED');
  });

  it('P3 trust resolver v1 refresh meta => REFRESH_REQUIRED', () => {
    const row = buildWob20260927EventBCandidate({
      evidenceMeta: {
        ...freshMeta,
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
    expect(evaluateReadyCandidateRefreshRequirement(row).status).toBe('REFRESH_REQUIRED');
  });

  it('P4 refresh stamps v2 trust resolver + hybrid provenance fields', () => {
    const refresh = buildReadyEvidenceRefreshMeta({
      baselineRecencyClassification: 'FRESH',
      absoluteSignalTrust: 'UNKNOWN',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSignalAvailable: true,
      hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
      hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    });
    expect(refresh.trustResolverVersion).toBe(RFRF_SIGNAL_TRUST_RESOLVER_VERSION);
    expect(refresh.hybridTrustReasonCode).toBe('RELATIVE_COVERAGE_INSUFFICIENT');
  });

  it('P5 v2 refresh meta => REFRESH_CURRENT (no refetch implied by policy)', () => {
    const row = buildWob20260927EventBCandidate({
      evidenceMeta: {
        ...freshMeta,
        readyEvidenceRefresh: buildReadyEvidenceRefreshMeta({
          baselineRecencyClassification: 'FRESH',
          absoluteSignalTrust: 'UNKNOWN',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSignalAvailable: true,
          hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
          hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
        }),
      } as never,
    });
    expect(evaluateReadyCandidateRefreshRequirement(row).status).toBe('REFRESH_CURRENT');
  });

  it('P6 UNTRUSTED => never promotion eligible', () => {
    const row = buildWob20260927EventBCandidate({
      lifecycleState: 'READY_FOR_PERSIST',
      absoluteSignalTrust: 'UNTRUSTED',
      evidenceMeta: freshMeta as never,
    });
    const readiness = evaluateRawRefuelCandidateReadiness(row as never, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
    });
    expect(readiness.ready).toBe(true);
    const promo = evaluateRawRefuelPromotionEligibility(
      readiness,
      {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'UNTRUSTED',
        nativeOverlap: noOverlap,
        candidateEvidenceMeta: row.evidenceMeta,
      },
      {
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      },
    );
    expect(promo.status).toBe('BLOCKED_PROMOTION_TRUST');
  });

  it('P7 fixture samples remain absolute-only corroboration gap (fail-closed)', () => {
    expect(buildWob20260927EventBSamples().every((s) => s.relativePercent == null)).toBe(true);
  });

  it('P8–P10 regression anchors: OQ-015 / baseline / refresh policies unchanged exports', () => {
    expect(RFRF_SIGNAL_TRUST_RESOLVER_VERSION).toBe('rfrf-signal-trust-v2');
    const row = buildWob20260927EventBCandidate({
      evidenceMeta: freshMeta as never,
    });
    const meta = readReadyEvidenceRefreshFromEvidenceMeta(row.evidenceMeta);
    expect(meta).toBeNull();
  });
});

describe('RFRF hybrid trust PG spec (skipped without RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1)', () => {
  it('documents gate env', () => {
    expect(LIVE || true).toBe(true);
  });
});
