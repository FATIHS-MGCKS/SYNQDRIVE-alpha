import {
  analyzeEngineRpmCadence,
  analyzeLvVoltageCadence,
  dedupeSortedTimestampsMs,
  detectCadenceRegimes,
  intervalsFromTimestampsMs,
} from './vsi-profile-cadence-stats.util';

const T0 = Date.parse('2026-10-01T10:00:00.000Z');

function msAt(secondOffset: number): number {
  return T0 + secondOffset * 1000;
}

describe('vsi-profile-cadence-stats.util', () => {
  it('Tiguan-like intermittent RPM buckets inside trips', () => {
    const trip = { tripId: 't1', startMs: msAt(0), endMs: msAt(600) };
    const points = [0, 3, 6, 12, 20, 45, 90, 200, 400, 550].map((s) => ({
      recordedAtMs: msAt(s),
      value: s % 2 === 0 ? 850 : 0,
    }));
    const cadence = analyzeEngineRpmCadence({
      iceRpmApplicable: true,
      tripWindows: [trip],
      points,
      provenance: [],
    });
    expect(cadence.observedDensityLabel).not.toBe('NOT_APPLICABLE');
    expect(cadence.limitations).toContain('DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF');
    expect(cadence.intervalMedianSeconds).toBeGreaterThan(0);
    expect(cadence.finalizedTripCount).toBe(1);
  });

  it('Audi/Arteon lower-density RPM distributions', () => {
    const trip = { tripId: 't1', startMs: msAt(0), endMs: msAt(1200) };
    const offsets = [0, 45, 120, 300, 600, 900, 1150];
    const cadence = analyzeEngineRpmCadence({
      iceRpmApplicable: true,
      tripWindows: [trip],
      points: offsets.map((s) => ({ recordedAtMs: msAt(s), value: 1200 })),
      provenance: [],
    });
    expect(cadence.intervalMedianSeconds).toBeGreaterThan(30);
    expect(['SUB_ONE_HZ', 'ONE_SECOND_BUCKETS_UNPROVEN']).toContain(
      cadence.observedDensityLabel,
    );
  });

  it('Tesla BEV marks ICE RPM NOT_APPLICABLE', () => {
    const cadence = analyzeEngineRpmCadence({
      iceRpmApplicable: false,
      tripWindows: [],
      points: [],
      provenance: [],
    });
    expect(cadence.observedDensityLabel).toBe('NOT_APPLICABLE');
    expect(cadence.regimes[0]?.kind).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('treats RPM=0 as measured and ignores nulls', () => {
    const trip = { tripId: 't1', startMs: msAt(0), endMs: msAt(30) };
    const cadence = analyzeEngineRpmCadence({
      iceRpmApplicable: true,
      tripWindows: [trip],
      points: [
        { recordedAtMs: msAt(0), value: 0 },
        { recordedAtMs: msAt(5), value: 0 },
        { recordedAtMs: msAt(10), value: Number.NaN },
      ],
      provenance: [],
    });
    expect(cadence.observedSampleCount).toBe(2);
    expect(cadence.distinctTimestampCount).toBe(2);
  });

  it('dedupes duplicate timestamps for interval math', () => {
    const intervals = intervalsFromTimestampsMs([
      msAt(0),
      msAt(0),
      msAt(5),
      msAt(10),
    ]);
    expect(intervals).toEqual([5, 5]);
    expect(dedupeSortedTimestampsMs([msAt(5), msAt(0), msAt(0)])).toHaveLength(2);
  });

  it('does not treat inter-trip idle as RPM gap', () => {
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
    const cadence = analyzeEngineRpmCadence({
      iceRpmApplicable: true,
      tripWindows: trips,
      points,
      provenance: [],
    });
    expect(cadence.maxIntraWindowGapSeconds).toBeLessThanOrEqual(5);
  });

  it('detects active LV poll-bound and ~8h resting heartbeat regimes', () => {
    const active = [0, 180, 360, 540].map((s) => msAt(s));
    const resting = [28800, 57600, 86400].map((s) => msAt(s));
    const timestamps = [...active, ...resting];
    const intervals = intervalsFromTimestampsMs(timestamps);
    const regimes = detectCadenceRegimes(intervals);
    expect(regimes.some((r) => r.kind === 'POLL_BOUND_ACTIVE')).toBe(true);
    expect(regimes.some((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT')).toBe(true);
    const restingRegime = regimes.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(restingRegime?.intervalMedianSeconds).toBeGreaterThan(7 * 3600);
    expect(restingRegime?.intervalMedianSeconds).toBeLessThan(9 * 3600);
  });

  it('classifies ~24h periodic heartbeat without hard-coded label', () => {
    const day = 24 * 3600;
    const intervals = [day, day, day];
    const regimes = detectCadenceRegimes(intervals);
    const resting = regimes.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting?.intervalMedianSeconds).toBeCloseTo(day, -2);
  });

  it('isolates LV cadence to link activation window (replacement link)', () => {
    const activatedAt = msAt(1000);
    const cadence = analyzeLvVoltageCadence({
      linkActivatedAtMs: activatedAt,
      linkDeactivatedAtMs: null,
      provenance: [],
      points: [
        { observedAtMs: msAt(0), providerTimestampMs: msAt(0) },
        { observedAtMs: msAt(2000), providerTimestampMs: msAt(2000) },
        { observedAtMs: msAt(2180), providerTimestampMs: msAt(2180) },
        { observedAtMs: msAt(2360), providerTimestampMs: msAt(2360) },
      ],
    });
    expect(cadence.observedSampleCount).toBe(3);
  });

  it('returns insufficient evidence for short LV history', () => {
    const cadence = analyzeLvVoltageCadence({
      linkActivatedAtMs: msAt(0),
      linkDeactivatedAtMs: null,
      provenance: [],
      points: [{ observedAtMs: msAt(10), providerTimestampMs: msAt(10) }],
    });
    expect(cadence.regimes[0]?.kind).toBe('INSUFFICIENT_EVIDENCE');
    expect(cadence.observedDensityLabel).toBe('UNKNOWN');
  });

  it('cadence semantic fingerprint is stable for identical evidence', () => {
    const input = {
      iceRpmApplicable: true,
      tripWindows: [{ tripId: 't', startMs: msAt(0), endMs: msAt(60) }],
      points: [
        { recordedAtMs: msAt(0), value: 1000 },
        { recordedAtMs: msAt(5), value: 1000 },
        { recordedAtMs: msAt(10), value: 1000 },
        { recordedAtMs: msAt(15), value: 1000 },
      ],
      provenance: [],
    };
    const a = analyzeEngineRpmCadence(input);
    const b = analyzeEngineRpmCadence(input);
    expect(a.cadenceSemanticFingerprint).toBe(b.cadenceSemanticFingerprint);
  });

  it('cadence semantic fingerprint changes on cadence drift', () => {
    const base = {
      iceRpmApplicable: true,
      tripWindows: [{ tripId: 't', startMs: msAt(0), endMs: msAt(120) }],
      provenance: [],
    };
    const sparse = analyzeEngineRpmCadence({
      ...base,
      points: [
        { recordedAtMs: msAt(0), value: 900 },
        { recordedAtMs: msAt(60), value: 900 },
        { recordedAtMs: msAt(120), value: 900 },
      ],
    });
    const dense = analyzeEngineRpmCadence({
      ...base,
      points: [0, 1, 2, 3, 4, 5].map((s) => ({ recordedAtMs: msAt(s), value: 900 })),
    });
    expect(sparse.cadenceSemanticFingerprint).not.toBe(dense.cadenceSemanticFingerprint);
  });
});
