import {
  analyzeEngineRpmCadence,
  analyzeLvVoltageCadence,
  buildCadenceSemanticFingerprint,
  collectIntraTripIntervalsSeconds,
  computeDistinctBucketCoverageRatio,
  dedupeLvPointsBySourceAdvance,
  detectCadenceRegimes,
  intervalsFromTimestampsMs,
  resolveIceRpmApplicability,
} from './vsi-profile-cadence-stats.util';
import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import {
  fingerprintVsiProfileSemanticEvaluation,
} from './vsi-profile-fingerprint.util';
import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import type { VsiProfileEvaluationDraft } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

const T0 = Date.parse('2026-10-01T10:00:00.000Z');

function msAt(secondOffset: number): number {
  return T0 + secondOffset * 1000;
}

function rpmInput(
  overrides: Partial<Parameters<typeof analyzeEngineRpmCadence>[0]> = {},
) {
  return {
    iceRpmApplicability: 'APPLICABLE' as const,
    tripWindows: [{ tripId: 't1', startMs: msAt(0), endMs: msAt(600) }],
    points: [],
    provenance: [],
    hfReadStatus: 'SUCCESS' as const,
    ...overrides,
  };
}

describe('vsi-profile-cadence-stats.util', () => {
  it('aggregates intra-trip intervals only across separated trips', () => {
    const trips = [
      { tripId: 'a', startMs: msAt(0), endMs: msAt(10) },
      { tripId: 'b', startMs: msAt(500), endMs: msAt(510) },
    ];
    const points = [
      { recordedAtMs: msAt(0), value: 900 },
      { recordedAtMs: msAt(5), value: 900 },
      { recordedAtMs: msAt(500), value: 800 },
      { recordedAtMs: msAt(505), value: 800 },
    ];
    const intervals = collectIntraTripIntervalsSeconds(points, trips);
    expect(intervals).toEqual([5, 5]);
    const cadence = analyzeEngineRpmCadence(rpmInput({ tripWindows: trips, points }));
    expect(cadence.maxIntraWindowGapSeconds).toBeLessThanOrEqual(5);
  });

  it('sparse endpoint trip never reaches 100% bucket coverage', () => {
    const trip = { tripId: 't1', startMs: msAt(0), endMs: msAt(600) };
    const points = [
      { recordedAtMs: msAt(0), value: 1000 },
      { recordedAtMs: msAt(600), value: 1000 },
    ];
    const ratio = computeDistinctBucketCoverageRatio(points, [trip]);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(0.01);
  });

  it('handles overlapping trips without double-counting timestamps', () => {
    const trips = [
      { tripId: 'a', startMs: msAt(0), endMs: msAt(100) },
      { tripId: 'b', startMs: msAt(50), endMs: msAt(150) },
    ];
    const points = [
      { recordedAtMs: msAt(60), value: 700 },
      { recordedAtMs: msAt(60), value: 700 },
      { recordedAtMs: msAt(65), value: 700 },
    ];
    const cadence = analyzeEngineRpmCadence(rpmInput({ tripWindows: trips, points }));
    expect(cadence.distinctTimestampCount).toBe(2);
  });

  it('unknown fuel type is not ICE NOT_APPLICABLE', () => {
    expect(resolveIceRpmApplicability(null)).toBe('UNKNOWN');
    const cadence = analyzeEngineRpmCadence(
      rpmInput({ iceRpmApplicability: 'UNKNOWN' }),
    );
    expect(cadence.observedDensityLabel).toBe('UNKNOWN');
    expect(cadence.limitations).toContain('POWERTRAIN_APPLICABILITY_UNKNOWN');
  });

  it('confirmed BEV is NOT_APPLICABLE for ICE RPM', () => {
    const cadence = analyzeEngineRpmCadence(
      rpmInput({ iceRpmApplicability: 'NOT_APPLICABLE' }),
    );
    expect(cadence.observedDensityLabel).toBe('NOT_APPLICABLE');
  });

  it('dedupes LV by provider source advancement', () => {
    const deduped = dedupeLvPointsBySourceAdvance([
      { observedAtMs: msAt(0), providerTimestampMs: msAt(0) },
      { observedAtMs: msAt(10), providerTimestampMs: msAt(0) },
      { observedAtMs: msAt(20), providerTimestampMs: msAt(20) },
    ]);
    expect(deduped).toHaveLength(2);
    const cadence = analyzeLvVoltageCadence({
      linkActivatedAtMs: msAt(0),
      linkDeactivatedAtMs: null,
      provenance: [],
      points: [
        { observedAtMs: msAt(0), providerTimestampMs: msAt(0) },
        { observedAtMs: msAt(10), providerTimestampMs: msAt(0) },
        { observedAtMs: msAt(200), providerTimestampMs: msAt(200) },
        { observedAtMs: msAt(400), providerTimestampMs: msAt(400) },
      ],
    });
    expect(cadence.observedSampleCount).toBe(3);
  });

  it('classifies stable 8h and 24h resting heartbeats with adequate regularity', () => {
    const eightHour = 8 * 3600;
    const day = 24 * 3600;
    const eight = detectCadenceRegimes([eightHour, eightHour, eightHour, eightHour, eightHour]);
    const resting8 = eight.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting8?.intervalMedianSeconds).toBeGreaterThan(7.5 * 3600);
    expect(resting8?.confidence).not.toBe('LOW');

    const dayIntervals = [day, day, day, day, day];
    const twentyFour = detectCadenceRegimes(dayIntervals);
    const resting24 = twentyFour.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting24?.intervalMedianSeconds).toBeCloseTo(day, -2);
  });

  it('does not certify HIGH periodicity for irregular multi-hour gaps', () => {
    const gaps = [7200, 18000, 36000, 108000];
    const regimes = detectCadenceRegimes(gaps);
    const resting = regimes.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting?.confidence).not.toBe('HIGH');
  });

  it('cadence semantic fingerprint ignores sample totals', () => {
    const base = rpmInput({
      points: [
        { recordedAtMs: msAt(0), value: 900 },
        { recordedAtMs: msAt(5), value: 900 },
        { recordedAtMs: msAt(10), value: 900 },
        { recordedAtMs: msAt(15), value: 900 },
      ],
    });
    const a = analyzeEngineRpmCadence(base);
    const b = analyzeEngineRpmCadence({
      ...base,
      points: [
        ...base.points,
        { recordedAtMs: msAt(20), value: 900 },
        { recordedAtMs: msAt(25), value: 900 },
      ],
    });
    expect(a.cadenceSemanticFingerprint).toBe(b.cadenceSemanticFingerprint);
    expect(b.observedSampleCount).toBeGreaterThan(a.observedSampleCount);
  });

  it('cadence semantic fingerprint changes on real drift', () => {
    const trip = { tripId: 't', startMs: msAt(0), endMs: msAt(120) };
    const sparse = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: [
          { recordedAtMs: msAt(0), value: 900 },
          { recordedAtMs: msAt(60), value: 900 },
          { recordedAtMs: msAt(120), value: 900 },
        ],
      }),
    );
    const dense = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: [0, 1, 2, 3, 4, 5].map((s) => ({
          recordedAtMs: msAt(s),
          value: 900,
        })),
      }),
    );
    expect(sparse.cadenceSemanticFingerprint).not.toBe(dense.cadenceSemanticFingerprint);
  });

  it('profile semantic revision stable when only cadence sample counters grow', () => {
    const draft: VsiProfileEvaluationDraft = {
      contractVersion: VSI_PROFILE_CONTRACT_VERSION,
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      providerIdentity: 'DIMO',
      verifiedModality: null,
      telemetrySourceFamily: null,
      evaluatedAt: new Date(),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: null,
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      signals: [],
      profileLimitations: [],
    };
    const trip = { tripId: 't', startMs: msAt(0), endMs: msAt(30) };
    const evidenceA = rpmInput({
      tripWindows: [trip],
      points: [
        { recordedAtMs: msAt(0), value: 1000 },
        { recordedAtMs: msAt(5), value: 1000 },
        { recordedAtMs: msAt(10), value: 1000 },
      ],
    });
    const evidenceB = {
      ...evidenceA,
      points: [
        ...evidenceA.points,
        { recordedAtMs: msAt(15), value: 1000 },
        { recordedAtMs: msAt(20), value: 1000 },
      ],
    };
    const evalA = enrichVsiProfileWithCadenceIntelligence(
      enrichVsiProfileWithSignalFingerprints(draft, { bundleSourceTimestamps: [] }),
      { rpmEvidence: evidenceA, lvEvidence: null },
    );
    const evalB = enrichVsiProfileWithCadenceIntelligence(
      enrichVsiProfileWithSignalFingerprints(draft, { bundleSourceTimestamps: [] }),
      { rpmEvidence: evidenceB, lvEvidence: null },
    );
    expect(fingerprintVsiProfileSemanticEvaluation(evalA)).toBe(
      fingerprintVsiProfileSemanticEvaluation(evalB),
    );
  });

  it('dedupes duplicate timestamps for interval math', () => {
    const intervals = intervalsFromTimestampsMs([
      msAt(0),
      msAt(0),
      msAt(5),
      msAt(10),
    ]);
    expect(intervals).toEqual([5, 5]);
  });

  it('buildCadenceSemanticFingerprint is stable for identical semantic payload', () => {
    const fp = buildCadenceSemanticFingerprint({ signal: 'lv_voltage', median: 180 });
    expect(fp).toBe(buildCadenceSemanticFingerprint({ signal: 'lv_voltage', median: 180 }));
  });
});
