import { CALIBRATION_UNSET_V0_BUNDLE, computeDiV0TripIntervals, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { presentObs } from '../../core/__tests__/test-helpers';
import type { NormalizedR1ObdObservation } from '../../core/types';
import { computeDiV0CombinedInputEvidenceVersion } from '../../evidence-input/di-v0-combined-input-identity';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { acquireDiV0HistoricalR1Obd, toDiV0S1R1ObdInput } from '../di-v0-r1-obd-acquisition';
import type { DiV0R1ObdAcquisitionResult } from '../di-v0-r1-obd-acquisition.types';
import {
  DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
  DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
  DI_V0_R1_OBD_EXCLUDED_PROVIDER_FIELDS,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
  DI_V0_R1_OBD_SUPERSEDED_VERSIONS,
} from '../di-v0-r1-obd-acquisition.versions';
import { normalizeDiV0R1ObdFromProviderRows } from '../di-v0-r1-obd-normalizer';
import { buildDiV0HistoricalR1ObdQuery } from '../di-v0-r1-obd-query';
import { serializeDiV0R1ObdSnapshot } from '../di-v0-r1-obd-snapshot';
import { baseR1Request, RUPTELA_DEVICE_IDENTITY } from './fixtures/s3b-r1-fixtures';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };
const FROM = '2026-01-01T00:00:00Z';
const TO = '2026-01-01T00:00:03Z';
const L0 = '2026-01-01T00:00:00Z';
const L1 = '2026-01-01T00:00:01Z';
const L2 = '2026-01-01T00:00:02Z';

const ACTIVE_FIELDS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'obdEngineLoad',
  'powertrainCombustionEngineECT',
] as const;

const OBSERVATION_KEY: Record<(typeof ACTIVE_FIELDS)[number], keyof NormalizedR1ObdObservation> = {
  speed: 'speedKmh',
  powertrainCombustionEngineSpeed: 'rpm',
  obdThrottlePosition: 'throttlePct',
  obdEngineLoad: 'loadPct',
  powertrainCombustionEngineECT: 'coolantC',
};

const GEAR = 'powertrainTransmissionCurrentGear';

function normalize(rows: Record<string, unknown>[], from = FROM, to = TO): DiV0R1ObdAcquisitionResult {
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(from, to));
  const out = normalizeDiV0R1ObdFromProviderRows(request, resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY), rows);
  if (!out.ok) throw new Error(out.failure.message);
  return out.result;
}

function sig(result: DiV0R1ObdAcquisitionResult, bucket: number, signal: string) {
  return result.buckets[bucket].signals.find((s) => s.signal === signal);
}

function fullRow(label: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: label,
    speed: 50,
    powertrainCombustionEngineSpeed: 2000,
    obdThrottlePosition: 20,
    obdEngineLoad: 35,
    powertrainCombustionEngineECT: 88,
    ...overrides,
  };
}

function queryString(): string {
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(FROM, TO));
  return buildDiV0HistoricalR1ObdQuery(7503, request.window);
}

describe('S3B V0_3 — exact query field set', () => {
  it('queries exactly the five authorized fields, each with agg: AVG', () => {
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.map((s) => s.providerField)).toEqual([...ACTIVE_FIELDS]);
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.every((s) => s.aggregation === 'AVG')).toBe(true);
    const q = queryString();
    for (const f of ACTIVE_FIELDS) expect(q).toContain(`${f}(agg: AVG)`);
    expect(q.match(/\(agg: [A-Z]+\)/g)).toHaveLength(5);
    expect(q).not.toMatch(/agg: (FIRST|LAST|MIN|MAX|MED|RAND)/);
  });

  it('currentGear and isIgnitionOn are absent from the spec and the query string', () => {
    const q = queryString();
    expect(q).not.toContain(GEAR);
    expect(q).not.toContain('isIgnitionOn');
    const ids = DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.map((s) => s.id as string);
    expect(ids).not.toContain(GEAR);
    expect(ids).not.toContain('isIgnitionOn');
    expect(Object.keys(DI_V0_R1_OBD_EXCLUDED_PROVIDER_FIELDS).sort()).toEqual(['isIgnitionOn', GEAR].sort());
  });
});

describe('S3B V0_3 — provider field authority', () => {
  it('all five active fields are PROVIDER_SCHEMA_VERIFIED; none repo-contract-only', () => {
    const signals = DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals;
    expect(signals.filter((s) => s.fieldAuthority === 'PROVIDER_SCHEMA_VERIFIED')).toHaveLength(5);
    expect(signals.filter((s) => s.fieldAuthority === 'REPO_CONTRACT_ONLY')).toHaveLength(0);
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_3.fieldAuthoritySource).toBe('DIMO_TELEMETRY_GRAPHQL_SCHEMA+DIMO_VSS_4_2_SPEC');
  });

  it('documented provider units and value scales match the C1D.9 authority', () => {
    const bySignal = Object.fromEntries(
      DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.map((s) => [s.id, [s.providerDocumentedUnit, s.valueScale]]),
    );
    expect(bySignal).toEqual({
      speed: ['km/h', 'KM_PER_HOUR'],
      powertrainCombustionEngineSpeed: ['rpm', 'RPM'],
      obdThrottlePosition: ['percent', 'PERCENT_0_100'],
      obdEngineLoad: ['percent', 'PERCENT_0_100'],
      powertrainCombustionEngineECT: ['celsius', 'CELSIUS'],
    });
  });

  it('field authority does not upgrade temporal authority', () => {
    expect(DI_V0_R1_OBD_QUERY_SPEC_V0_3.temporalSemantics).toBe('INTERVAL_ONLY');
    const r = normalize([fullRow(L0)]);
    expect(r.buckets.every((b) => b.temporalSemantics === 'INTERVAL_ONLY')).toBe(true);
    expect(r.buckets.every((b) => b.qualityFlags.includes('TEMPORAL_UNCERTAINTY'))).toBe(true);
    expect(r.observations.every((o) => o.temporalConfidence === 'INTERVAL_ONLY')).toBe(true);
    expect(r.fixedTimeCorrectionApplied).toBe(false);
    expect(r.observations[0].provenance).toEqual({
      sourceSignal: 'DI_V0_R1_OBD_QUERY_V0_3',
      derivedFrom: ['DI_V0_R1_OBD_QUERY_V0_3', 'INTERVAL_ONLY'],
    });
  });
});

describe('S3B V0_3 — versions and snapshot identity', () => {
  it('result, snapshot, and input evidence carry V0_3 identifiers only', () => {
    const r = normalize([fullRow(L0)]);
    expect(r.adapterVersion).toBe(DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3);
    expect(r.querySpecId).toBe('DI_V0_R1_OBD_QUERY_V0_3');
    expect(r.snapshotIdentity.version).toBe(DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3);
    expect(r.snapshotIdentity.inputEvidenceVersion).toBe(
      `DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3:sha256:${r.snapshotIdentity.digest}`,
    );
  });

  it('V0_3 never aliases superseded V0_2 identifiers', () => {
    const r = normalize([fullRow(L0)]);
    const request = validateDiV0PositionAcquisitionRequest(baseR1Request(FROM, TO));
    const serialized = serializeDiV0R1ObdSnapshot({
      dimoTokenId: 7503,
      vehicleId: request.vehicleId,
      window: request.window,
      sourceFamily: r.sourceFamily,
      sourceFamilyPolicyVersion: r.sourceFamilyResolution.policyVersion,
      buckets: r.buckets,
    });
    for (const legacy of DI_V0_R1_OBD_SUPERSEDED_VERSIONS) {
      expect(serialized).not.toContain(legacy);
      expect(r.snapshotIdentity.inputEvidenceVersion.startsWith(legacy)).toBe(false);
      expect([r.adapterVersion, r.querySpecId, r.snapshotIdentity.version]).not.toContain(legacy);
    }
    const pins = (r1: string) =>
      computeDiV0CombinedInputEvidenceVersion([
        { channel: 'POSITION', state: 'NOT_AVAILABLE', inputEvidenceVersion: null },
        { channel: 'R1_OBD', state: 'PRESENT', inputEvidenceVersion: r1 },
        { channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: null },
      ]);
    const v03 = pins(r.snapshotIdentity.inputEvidenceVersion);
    const v02 = pins(`DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_2:sha256:${r.snapshotIdentity.digest}`);
    expect(v03).not.toBe(v02);
    expect(v03).toMatch(/^DI_V0_COMBINED_INPUT_IDENTITY_V0_2:sha256:/);
  });

  it('reordered identical evidence → same snapshot', () => {
    const rows = [fullRow(L0), fullRow(L2, { speed: 55 }), fullRow(L1, { speed: 52 })];
    expect(normalize(rows).snapshotIdentity.digest).toBe(normalize([...rows].reverse()).snapshotIdentity.digest);
  });

  it.each(ACTIVE_FIELDS)('material %s change → different snapshot', (field) => {
    const base = normalize([fullRow(L0)]);
    const changed = normalize([fullRow(L0, { [field]: (fullRow(L0)[field] as number) + 1 })]);
    expect(changed.snapshotIdentity.digest).not.toBe(base.snapshotIdentity.digest);
  });

  it('availability change (null vs row absent vs value) → different snapshots', () => {
    const value = normalize([{ timestamp: L0, speed: 50 }]);
    const nul = normalize([{ timestamp: L0, speed: null }]);
    const absent = normalize([]);
    const digests = new Set([value, nul, absent].map((r) => r.snapshotIdentity.digest));
    expect(digests.size).toBe(3);
  });
});

describe('S3B V0_3 — per-field semantics', () => {
  it.each(ACTIVE_FIELDS)('%s: null → SIGNAL_NULL; missing row → ROW_ABSENT', (field) => {
    const r = normalize([{ timestamp: L0, [field]: null }]);
    expect(sig(r, 0, field)).toMatchObject({ availability: 'SIGNAL_NULL', value: null });
    expect(sig(r, 1, field)).toMatchObject({ availability: 'ROW_ABSENT', value: null });
    expect(r.observations[0][OBSERVATION_KEY[field]]).toBeUndefined();
  });

  it.each(ACTIVE_FIELDS)('%s: no forward fill across absent or null buckets', (field) => {
    const r = normalize([
      { timestamp: L0, [field]: 42 },
      { timestamp: L2, [field]: null },
    ]);
    expect(sig(r, 0, field)).toMatchObject({ availability: 'VALUE_PRESENT', value: 42 });
    expect(sig(r, 1, field)?.availability).toBe('ROW_ABSENT');
    expect(sig(r, 2, field)).toMatchObject({ availability: 'SIGNAL_NULL', value: null });
    expect(r.observations).toHaveLength(2);
    expect(r.observations[1].bucketLabel).toBe(L2);
    expect(r.observations[1][OBSERVATION_KEY[field]]).toBeUndefined();
  });

  it.each(ACTIVE_FIELDS)('%s: non-finite or non-numeric input fails safe to SIGNAL_NULL', (field) => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '50', true, {}]) {
      const r = normalize([{ timestamp: L0, [field]: bad }]);
      expect(sig(r, 0, field)).toMatchObject({ availability: 'SIGNAL_NULL', value: null });
      expect(r.observations[0][OBSERVATION_KEY[field]]).toBeUndefined();
    }
  });

  it.each(ACTIVE_FIELDS)('%s: identical duplicate rows collapse', (field) => {
    const r = normalize([
      { timestamp: L0, [field]: 42 },
      { timestamp: L0, [field]: 42 },
    ]);
    expect(sig(r, 0, field)).toMatchObject({ availability: 'VALUE_PRESENT', value: 42 });
    expect(r.observations[0][OBSERVATION_KEY[field]]).toBe(42);
    expect(r.buckets[0].qualityFlags).toContain('DUPLICATE_BUCKET_IDENTICAL');
  });

  it.each(ACTIVE_FIELDS)('%s: conflicting duplicate rows become unusable', (field) => {
    const r = normalize([
      { timestamp: L0, [field]: 42 },
      { timestamp: L0, [field]: 43 },
    ]);
    expect(sig(r, 0, field)).toMatchObject({ availability: 'CONFLICTING_DUPLICATE', value: null, conflictingValues: [42, 43] });
    expect(r.observations[0][OBSERVATION_KEY[field]]).toBeUndefined();
    expect(r.buckets[0].qualityFlags).toContain('DUPLICATE_BUCKET_CONFLICTING');
  });

  it('observed C1D.9 ranges are not validation thresholds', () => {
    const r = normalize([
      fullRow(L0, {
        powertrainCombustionEngineSpeed: 7800,
        obdThrottlePosition: 100,
        obdEngineLoad: 0,
        powertrainCombustionEngineECT: -30,
        speed: 250,
      }),
      fullRow(L1, { powertrainCombustionEngineECT: 200, obdEngineLoad: 100, obdThrottlePosition: 0 }),
    ]);
    expect(r.observations[0]).toMatchObject({ rpm: 7800, throttlePct: 100, loadPct: 0, coolantC: -30, speedKmh: 250 });
    expect(r.observations[1]).toMatchObject({ coolantC: 200, loadPct: 100, throttlePct: 0 });
  });
});

describe('S3B V0_3 — throttle / engine load percent scale and ECT Celsius', () => {
  it('throttle and load are passed through in percent 0..100 (no /100 or *100)', () => {
    const r = normalize([
      fullRow(L0, { obdThrottlePosition: 10.196078431372548, obdEngineLoad: 99.6078431372549 }),
      fullRow(L1, { obdThrottlePosition: 0.5, obdEngineLoad: 0.5 }),
    ]);
    expect(r.observations[0].throttlePct).toBe(10.196078431372548);
    expect(r.observations[0].loadPct).toBe(99.6078431372549);
    expect(r.observations[1].throttlePct).toBe(0.5);
    expect(r.observations[1].loadPct).toBe(0.5);
    expect(sig(r, 0, 'obdThrottlePosition')?.unit).toBe('%');
    expect(sig(r, 0, 'obdEngineLoad')?.unit).toBe('%');
  });

  it('ECT is preserved as provider Celsius with no temperature claim or flag', () => {
    const r = normalize([fullRow(L0, { powertrainCombustionEngineECT: 118 })]);
    expect(r.observations[0].coolantC).toBe(118);
    expect(sig(r, 0, 'powertrainCombustionEngineECT')?.unit).toBe('°C');
    expect(r.buckets[0].qualityFlags).toEqual(['TEMPORAL_UNCERTAINTY']);
    expect(Object.keys(r.observations[0]).sort()).toEqual(
      ['bucketLabel', 'coolantC', 'loadPct', 'provenance', 'rpm', 'speedKmh', 'temporalConfidence', 'throttlePct'].sort(),
    );
  });
});

describe('S3B V0_3 — currentGear removal', () => {
  it('normalized evidence carries no gear signal or gear observation field', () => {
    const r = normalize([fullRow(L0, { [GEAR]: 4 })]);
    expect(r.buckets[0].signals.map((s) => s.signal)).toEqual([...ACTIVE_FIELDS]);
    expect(r.observations[0]).not.toHaveProperty('gear');
  });

  it('synthetic gear input (integer, fractional, absent) cannot alter evidence or snapshot', () => {
    const none = normalize([fullRow(L0)]);
    const integer = normalize([fullRow(L0, { [GEAR]: 3 })]);
    const fractional = normalize([fullRow(L0, { [GEAR]: 3.4567 })]);
    const reverse = normalize([fullRow(L0, { [GEAR]: -1 })]);
    for (const r of [integer, fractional, reverse]) {
      expect(r.snapshotIdentity.digest).toBe(none.snapshotIdentity.digest);
      expect(r.buckets).toEqual(none.buckets);
      expect(r.observations).toEqual(none.observations);
    }
    const serialized = JSON.stringify(fractional);
    expect(serialized).not.toContain('3.4567');
    expect(serialized).not.toContain(GEAR);
    expect(serialized.toLowerCase()).not.toContain('gear');
  });

  it('conflicting gear duplicates do not create a conflicting bucket', () => {
    const r = normalize([fullRow(L0, { [GEAR]: 3 }), fullRow(L0, { [GEAR]: 4 })]);
    expect(r.buckets[0].qualityFlags).toContain('DUPLICATE_BUCKET_IDENTICAL');
    expect(r.counters.conflictingDuplicateBuckets).toBe(0);
  });

  it('isIgnitionOn in provider rows is ignored', () => {
    const a = normalize([fullRow(L0)]);
    const b = normalize([fullRow(L0, { isIgnitionOn: 0.5 })]);
    expect(b.snapshotIdentity.digest).toBe(a.snapshotIdentity.digest);
    expect(JSON.stringify(b)).not.toContain('isIgnitionOn');
  });
});

describe('S3B V0_3 — L3 precedence (R1 can never create or override numeric speed)', () => {
  const LAT_STEP_50_KMH = 50 / 3.6 / 111_195;
  const labels = ['2026-09-26T09:57:19Z', '2026-09-26T09:57:20Z', '2026-09-26T09:57:21Z', '2026-09-26T09:57:22Z'];
  const positions = labels.map((l, i) => presentObs(l, 52 + i * LAT_STEP_50_KMH, 9));

  function r1At80(): NormalizedR1ObdObservation[] {
    return toDiV0S1R1ObdInput(
      normalize(
        labels.map((l) => fullRow(l, { speed: 80 })),
        labels[0],
        '2026-09-26T09:57:23Z',
      ),
    );
  }

  it('L3 ≈ 50 / R1 = 80 → numeric speed stays L3', () => {
    const base = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const withR1 = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions, r1Obd: r1At80() }, ctx);
    const speeds = withR1.intervals.map((i) => i.estimatedSpeedKmh);
    expect(speeds).toEqual(base.intervals.map((i) => i.estimatedSpeedKmh));
    const numeric = speeds.filter((s): s is number => typeof s === 'number');
    expect(numeric.length).toBeGreaterThan(0);
    for (const s of numeric) {
      expect(Math.abs(s - 50)).toBeLessThan(1);
      expect(s).not.toBe(80);
    }
  });

  it('no L3 support / R1 = 80 → no numeric speed emitted', () => {
    const none = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions: [], r1Obd: r1At80() }, ctx);
    expect(none.intervals).toHaveLength(0);
    const single = computeDiV0TripIntervals(
      { sourceFamily: 'RUPTELA_R1', positions: [positions[1]], r1Obd: r1At80() },
      ctx,
    );
    expect(single.intervals.every((i) => i.estimatedSpeedKmh === null)).toBe(true);
    expect(single.intervals.every((i) => i.claimLevel !== 'L3')).toBe(true);
  });

  it('acquisition path uses the V0_3 query end to end', async () => {
    let captured = '';
    const outcome = await acquireDiV0HistoricalR1Obd(baseR1Request(FROM, TO), {
      executeHistoricalR1ObdQuery: async (input) => {
        captured = input.query;
        return { data: { signals: [fullRow(L0, { [GEAR]: 2.5 })] } };
      },
    });
    expect(outcome.status).toBe('ACQUIRED');
    expect(captured).not.toContain(GEAR);
    if (outcome.status === 'ACQUIRED') {
      expect(outcome.result.adapterVersion).toBe(DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3);
      expect(JSON.stringify(outcome.result)).not.toContain('2.5');
    }
  });
});
