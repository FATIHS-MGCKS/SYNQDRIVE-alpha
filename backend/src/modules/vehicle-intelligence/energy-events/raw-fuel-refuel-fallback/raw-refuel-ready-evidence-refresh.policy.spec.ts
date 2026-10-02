import type { RawRefuelCandidate } from '@prisma/client';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import { RFRF_SIGNAL_TRUST_RESOLVER_VERSION } from './raw-fuel-signal-trust.resolver';
import {
  buildReadyEvidenceRefreshMeta,
  mergeReadyEvidenceRefreshIntoEvidenceMeta,
  readReadyEvidenceRefreshFromEvidenceMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';
import {
  RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION,
  evaluateReadyCandidateRefreshRequirement,
} from './raw-refuel-ready-evidence-refresh.policy';
import { buildWob20260927EventBCandidate } from './testing/wob-2026-09-19-stretched-end.fixture';
import {
  buildHybridAbsoluteSignalTrustEvidence,
  mergeHybridAbsoluteSignalTrustEvidence,
} from './raw-fuel-hybrid-trust-evidence-metadata';

function defaultHybridEvidence(
  overrides: Partial<ReturnType<typeof buildHybridAbsoluteSignalTrustEvidence>> = {},
) {
  return buildHybridAbsoluteSignalTrustEvidence(
    {
      authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
      classification: 'UNKNOWN',
      reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSampleCoverage: 'PARTIAL',
      baselineRecencyClassification: 'FRESH',
      absoluteDeltaLiters: 9,
      relativeDeltaPercent: null,
      materialRiseLiters: 5,
      materialRisePercent: 5,
      relativePrePlateauLocal: 'INVALID',
      relativePostPlateauLocal: 'UNKNOWN',
      absolutePostPlateauLocal: 'VALID',
    },
    {
      relativePrePlateauLocal: 'INVALID',
      relativePostPlateauLocal: 'UNKNOWN',
      absolutePostPlateauLocal: 'VALID',
    },
  );
}

function readyWithRefreshMeta(
  overrides: Partial<ReturnType<typeof buildReadyEvidenceRefreshMeta>> = {},
  hybridOverrides: Partial<ReturnType<typeof buildHybridAbsoluteSignalTrustEvidence>> = {},
): Pick<RawRefuelCandidate, 'evidenceMeta' | 'detectorVersion' | 'detectionVersion'> {
  const refresh = buildReadyEvidenceRefreshMeta({
    baselineRecencyClassification: 'FRESH',
    absoluteSignalTrust: 'UNKNOWN',
    absoluteDetectionAdmissibility: 'ADMISSIBLE',
    relativeSignalAvailable: true,
    hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
    hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    ...overrides,
  });
  const baselineMeta = buildBaselineRecencyEvidenceMeta({
    classification: 'FRESH',
    reason: 'test_fresh',
    bridgeGapSeconds: 120,
    prePlateauStartAt: new Date('2026-09-27T21:30:00.000Z'),
    prePlateauEndAt: new Date('2026-09-27T21:34:00.000Z'),
    riseOnsetAt: new Date('2026-09-27T21:34:16.923Z'),
    interveningPrimarySampleCount: 0,
    interveningContradictionCount: 0,
  });
  const hybrid = { ...defaultHybridEvidence(), ...hybridOverrides };
  if (overrides.hybridTrustReasonCode) {
    hybrid.reasonCode = overrides.hybridTrustReasonCode;
  }
  let evidenceMeta = mergeReadyEvidenceRefreshIntoEvidenceMeta(baselineMeta, refresh);
  evidenceMeta = mergeHybridAbsoluteSignalTrustEvidence(evidenceMeta, hybrid);
  return {
    detectorVersion: RFRF_RISE_DETECTOR_VERSION,
    detectionVersion: RFRF_RISE_DETECTION_VERSION,
    evidenceMeta: evidenceMeta as RawRefuelCandidate['evidenceMeta'],
  };
}

describe('evaluateReadyCandidateRefreshRequirement', () => {
  it('legacy READY without baseline or refresh metadata => REFRESH_REQUIRED', () => {
    const legacy = buildWob20260927EventBCandidate();
    const result = evaluateReadyCandidateRefreshRequirement(legacy);
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('baseline_recency_missing');
  });

  it('UNKNOWN trust with current refresh metadata => REFRESH_CURRENT', () => {
    const result = evaluateReadyCandidateRefreshRequirement(readyWithRefreshMeta());
    expect(result.status).toBe('REFRESH_CURRENT');
    expect(result.reason).toBe('ready_evidence_refresh_current');
  });

  it('stale trust resolver version => REFRESH_REQUIRED (future trust bump contract)', () => {
    const base = readyWithRefreshMeta();
    const refresh = readReadyEvidenceRefreshFromEvidenceMeta(base.evidenceMeta)!;
    const staleEvidence = mergeReadyEvidenceRefreshIntoEvidenceMeta(
      base.evidenceMeta as Record<string, unknown>,
      { ...refresh, trustResolverVersion: 'rfrf-signal-trust-v0' },
    );
    const result = evaluateReadyCandidateRefreshRequirement({
      ...base,
      evidenceMeta: staleEvidence as RawRefuelCandidate['evidenceMeta'],
    });
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('trust_resolver_version_stale');
  });

  it('current version match after refresh => not required solely due to UNKNOWN trust', () => {
    const first = evaluateReadyCandidateRefreshRequirement(readyWithRefreshMeta());
    expect(first.status).toBe('REFRESH_CURRENT');
    const second = evaluateReadyCandidateRefreshRequirement(
      readyWithRefreshMeta({ absoluteSignalTrust: 'UNKNOWN' }),
    );
    expect(second.status).toBe('REFRESH_CURRENT');
  });

  it('exports versioned policy and trust resolver constants', () => {
    expect(RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION).toBe('rfrf-ready-evidence-refresh-v1');
    expect(RFRF_SIGNAL_TRUST_RESOLVER_VERSION).toBe('rfrf-signal-trust-v2');
  });

  it('H1 — v2 resolver without hybrid provenance block => REFRESH_REQUIRED', () => {
    const base = readyWithRefreshMeta();
    const { hybridAbsoluteSignalTrust: _removed, ...rest } = base.evidenceMeta as Record<
      string,
      unknown
    >;
    const result = evaluateReadyCandidateRefreshRequirement({
      ...base,
      evidenceMeta: rest as RawRefuelCandidate['evidenceMeta'],
    });
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('hybrid_trust_provenance_missing');
  });

  it('H2 — stale hybrid authority version => REFRESH_REQUIRED', () => {
    const base = readyWithRefreshMeta({
      hybridTrustAuthorityVersion: 'rfrf-hybrid-absolute-trust-v0',
    });
    const result = evaluateReadyCandidateRefreshRequirement(base);
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('hybrid_trust_authority_stale');
  });

  it('H3 — malformed hybrid provenance => FAIL_CLOSED', () => {
    const base = readyWithRefreshMeta();
    const evidence = {
      ...(base.evidenceMeta as Record<string, unknown>),
      hybridAbsoluteSignalTrust: {
        authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
        computedHybridClassification: 'BOGUS',
        reasonCode: 'CORROBORATED_RISE',
        baselineRecencyClassification: 'FRESH',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        relativeSampleCoverage: 'SUFFICIENT',
        absoluteDeltaLiters: 9,
        relativeDeltaPercent: 10,
        materialRiseLiters: 5,
        materialRisePercent: 5,
        relativePrePlateauLocal: 'VALID',
        relativePostPlateauLocal: 'VALID',
        absolutePostPlateauLocal: 'VALID',
      },
    };
    const result = evaluateReadyCandidateRefreshRequirement({
      ...base,
      evidenceMeta: evidence as RawRefuelCandidate['evidenceMeta'],
    });
    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.reason).toBe('hybrid_trust_provenance_malformed');
  });

  it('H4 — complete current hybrid provenance => REFRESH_CURRENT', () => {
    expect(evaluateReadyCandidateRefreshRequirement(readyWithRefreshMeta()).status).toBe(
      'REFRESH_CURRENT',
    );
  });

  it('H5 — UNKNOWN hybrid classification with current provenance => REFRESH_CURRENT', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      readyWithRefreshMeta(
        { absoluteSignalTrust: 'UNKNOWN', hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT' },
        { computedHybridClassification: 'UNKNOWN', reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT' },
      ),
    );
    expect(result.status).toBe('REFRESH_CURRENT');
  });

  function withHybridBlock(
    base: Pick<RawRefuelCandidate, 'evidenceMeta' | 'detectorVersion' | 'detectionVersion'>,
    block: Record<string, unknown>,
  ) {
    return {
      ...base,
      evidenceMeta: {
        ...(base.evidenceMeta as Record<string, unknown>),
        hybridAbsoluteSignalTrust: block,
      } as RawRefuelCandidate['evidenceMeta'],
    };
  }

  function withoutRefreshHybridAuthority(
    base: Pick<RawRefuelCandidate, 'evidenceMeta' | 'detectorVersion' | 'detectionVersion'>,
  ) {
    const refresh = readReadyEvidenceRefreshFromEvidenceMeta(base.evidenceMeta)!;
    const { hybridTrustAuthorityVersion: _removed, ...rest } = refresh;
    const evidenceMeta = mergeReadyEvidenceRefreshIntoEvidenceMeta(
      base.evidenceMeta as Record<string, unknown>,
      rest as typeof refresh,
    );
    return { ...base, evidenceMeta: evidenceMeta as RawRefuelCandidate['evidenceMeta'] };
  }

  const validHybridShape = () => ({
    authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    computedHybridClassification: 'UNKNOWN',
    reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
    baselineRecencyClassification: 'FRESH',
    absoluteDetectionAdmissibility: 'ADMISSIBLE',
    relativeSampleCoverage: 'PARTIAL',
    absoluteDeltaLiters: 9,
    relativeDeltaPercent: null,
    materialRiseLiters: 5,
    materialRisePercent: 5,
    relativePrePlateauLocal: 'INVALID',
    relativePostPlateauLocal: 'UNKNOWN',
    absolutePostPlateauLocal: 'VALID',
  });

  it('V1 — missing hybridTrustAuthorityVersion in readyEvidenceRefresh => NOT REFRESH_CURRENT', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withoutRefreshHybridAuthority(readyWithRefreshMeta()),
    );
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('hybrid_trust_authority_missing');
  });

  it('V2 — missing hybrid locality field => FAIL_CLOSED', () => {
    const base = readyWithRefreshMeta();
    const block = validHybridShape();
    delete (block as Record<string, unknown>).relativePrePlateauLocal;
    const result = evaluateReadyCandidateRefreshRequirement(withHybridBlock(base, block));
    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.reason).toBe('hybrid_trust_provenance_malformed');
  });

  it('V3 — invalid relativeSampleCoverage => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        relativeSampleCoverage: 'BROKEN',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V4 — invalid baseline classification string => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        baselineRecencyClassification: 'NOT_REAL',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V5 — invalid locality string => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        absolutePostPlateauLocal: 'MAYBE',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V6 — absoluteDeltaLiters wrong type => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        absoluteDeltaLiters: '9',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V7 — relativeDeltaPercent wrong type => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        relativeDeltaPercent: '1.5',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V8 — materialRiseLiters NaN => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        materialRiseLiters: Number.NaN,
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V9 — materialRisePercent Infinity => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        materialRisePercent: Number.POSITIVE_INFINITY,
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V10 — arbitrary reasonCode => FAIL_CLOSED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(readyWithRefreshMeta(), {
        ...validHybridShape(),
        reasonCode: 'BOGUS_REASON',
      }),
    );
    expect(result.status).toBe('FAIL_CLOSED');
  });

  it('V11 — hybrid reason != ready refresh reason => REFRESH_REQUIRED', () => {
    const base = readyWithRefreshMeta({ hybridTrustReasonCode: 'CORROBORATED_RISE' });
    const result = evaluateReadyCandidateRefreshRequirement(
      withHybridBlock(base, validHybridShape()),
    );
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('hybrid_trust_reason_stale');
  });

  it('V12 — hybrid authority version missing in refresh meta => REFRESH_REQUIRED', () => {
    expect(
      evaluateReadyCandidateRefreshRequirement(withoutRefreshHybridAuthority(readyWithRefreshMeta()))
        .reason,
    ).toBe('hybrid_trust_authority_missing');
  });

  it('V13 — stale hybrid authority in refresh meta => REFRESH_REQUIRED', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      readyWithRefreshMeta({ hybridTrustAuthorityVersion: 'rfrf-hybrid-absolute-trust-v0' }),
    );
    expect(result.status).toBe('REFRESH_REQUIRED');
    expect(result.reason).toBe('hybrid_trust_authority_stale');
  });

  it('V14 — complete UNKNOWN provenance => REFRESH_CURRENT', () => {
    expect(
      evaluateReadyCandidateRefreshRequirement(
        readyWithRefreshMeta(
          { hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT' },
          {
            computedHybridClassification: 'UNKNOWN',
            reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
          },
        ),
      ).status,
    ).toBe('REFRESH_CURRENT');
  });

  it('V15 — complete TRUSTED provenance => REFRESH_CURRENT at policy layer', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      readyWithRefreshMeta(
        {
          absoluteSignalTrust: 'UNKNOWN',
          hybridTrustReasonCode: 'CORROBORATED_RISE',
        },
        {
          computedHybridClassification: 'TRUSTED',
          reasonCode: 'CORROBORATED_RISE',
          relativeSampleCoverage: 'SUFFICIENT',
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
        },
      ),
    );
    expect(result.status).toBe('REFRESH_CURRENT');
  });

  it('V16 — complete UNTRUSTED provenance => REFRESH_CURRENT at policy layer', () => {
    const result = evaluateReadyCandidateRefreshRequirement(
      readyWithRefreshMeta(
        {
          absoluteSignalTrust: 'UNKNOWN',
          hybridTrustReasonCode: 'RELATIVE_CONTRADICTS_ABSOLUTE',
        },
        {
          computedHybridClassification: 'UNTRUSTED',
          reasonCode: 'RELATIVE_CONTRADICTS_ABSOLUTE',
          relativeSampleCoverage: 'SUFFICIENT',
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
        },
      ),
    );
    expect(result.status).toBe('REFRESH_CURRENT');
  });
});

describe('READY recovery gap (static contract)', () => {
  it('recoverReadyCandidate evaluates refresh before optional DIMO pass', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(
        __dirname,
        '../raw-refuel-candidate/raw-refuel-candidate-recovery.service.ts',
      ),
      'utf8',
    );
    const readyFn = src.slice(
      src.indexOf('private async recoverReadyCandidate'),
      src.indexOf('private async recoverEvidenceMaturityCandidate'),
    );
    expect(readyFn).toContain('evaluateReadyCandidateRefreshRequirement');
    expect(readyFn).toContain('executeHistoricalSampleRecoveryPass');
    expect(readyFn).toContain("refreshRequirement.status === 'REFRESH_REQUIRED'");

    const maturityFn = src.slice(
      src.indexOf('private async recoverEvidenceMaturityCandidate'),
      src.indexOf('private async executeHistoricalSampleRecoveryPass'),
    );
    expect(maturityFn).toContain('fetchHistoricalSamples');
    expect(maturityFn.indexOf('fetchHistoricalSamples')).toBeLessThan(
      maturityFn.indexOf('selectRecoverySameObservation'),
    );
  });
});
