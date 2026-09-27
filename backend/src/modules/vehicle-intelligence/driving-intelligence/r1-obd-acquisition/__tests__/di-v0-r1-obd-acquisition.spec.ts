import { computeDiV0TripIntervals } from '../../core/compute-trip-intervals';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { presentObs } from '../../core/__tests__/test-helpers';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { assertR1ObdSourceFamilyEligible, acquireDiV0HistoricalR1Obd, toDiV0S1R1ObdInput } from '../di-v0-r1-obd-acquisition';
import { normalizeDiV0R1ObdFromProviderRows } from '../di-v0-r1-obd-normalizer';
import { computeDiV0CombinedInputEvidenceVersion } from '../../evidence-input/di-v0-combined-input-identity';
import {
  baseR1Request,
  engineIgnitionDropoutRow,
  legacyStaleSpeedingRow,
  RUPTELA_DEVICE_IDENTITY,
  SYNTHETIC_DEVICE_IDENTITY,
  wobSparseR1Rows,
} from './fixtures/s3b-r1-fixtures';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

function normalizeRows(fromUtc: string, toUtc: string, rows: Record<string, unknown>[]) {
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(fromUtc, toUtc));
  const sourceFamilyResolution = resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY);
  const out = normalizeDiV0R1ObdFromProviderRows(request, sourceFamilyResolution, rows, {
    longGapThresholdSeconds: 30,
  });
  if (!out.ok) throw new Error(out.failure.message);
  return out.result;
}

describe('S3B R1 OBD acquisition', () => {
  it('RUPTELA_R1 eligible; API_SYNTHETIC and UNKNOWN rejected at acquisition', async () => {
    expect(assertR1ObdSourceFamilyEligible('RUPTELA_R1')).toBe(true);
    expect(assertR1ObdSourceFamilyEligible('API_SYNTHETIC')).toBe(false);
    const transport = { executeHistoricalR1ObdQuery: async () => ({ data: { signals: [] } }) };
    const syn = await acquireDiV0HistoricalR1Obd(
      { ...baseR1Request('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'), dimoDeviceIdentity: SYNTHETIC_DEVICE_IDENTITY },
      transport,
    );
    expect(syn.status).toBe('FAILED');
    if (syn.status === 'FAILED') expect(syn.failure.code).toBe('UNSUPPORTED_SOURCE_FAMILY');
  });

  it('VALUE_PRESENT / SIGNAL_NULL / ROW_ABSENT without forward fill', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-01T00:00:03Z';
    const rows = [
      { timestamp: '2026-01-01T00:00:00Z', speed: 30 },
      { timestamp: '2026-01-01T00:00:01Z', speed: null },
    ];
    const result = normalizeRows(from, to, rows);
    const b0 = result.buckets[0].signals.find((s) => s.signal === 'speed');
    const b1 = result.buckets[1].signals.find((s) => s.signal === 'speed');
    const b2 = result.buckets[2].signals.find((s) => s.signal === 'speed');
    expect(b0?.availability).toBe('VALUE_PRESENT');
    expect(b1?.availability).toBe('SIGNAL_NULL');
    expect(b2?.availability).toBe('ROW_ABSENT');
    expect(result.fixedTimeCorrectionApplied).toBe(false);
  });

  it('rejects negative speed (withhold, no abs)', () => {
    const result = normalizeRows('2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', [
      { timestamp: '2026-01-01T00:00:00Z', speed: -5 },
    ]);
    const speed = result.buckets[0].signals.find((s) => s.signal === 'speed');
    expect(speed?.availability).toBe('SIGNAL_NULL');
    expect(result.observations[0]?.speedKmh).toBeUndefined();
  });

  it('sparse sequence + long gap flags; INTERVAL_ONLY only', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-01T00:01:40Z';
    const result = normalizeRows(from, to, wobSparseR1Rows(from));
    expect(result.qualityFlags).toContain('SPARSE_SIGNAL');
    expect(result.buckets.every((b) => b.temporalSemantics === 'INTERVAL_ONLY')).toBe(true);
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.observations.length).toBeLessThan(result.counters.requestedBuckets);
  });

  it('R1 cannot override L3 numeric speed', () => {
    const label = '2026-09-26T09:57:20Z';
    const positions = [
      presentObs('2026-09-26T09:57:19Z', 52, 9),
      presentObs('2026-09-26T09:57:20Z', 52.0002, 9),
      presentObs('2026-09-26T09:57:21Z', 52.0004, 9),
      presentObs('2026-09-26T09:57:22Z', 52.0006, 9),
    ];
    const r1 = toDiV0S1R1ObdInput(
      normalizeRows('2026-09-26T09:57:19Z', '2026-09-26T09:57:23Z', [legacyStaleSpeedingRow(label)]),
    );
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions, r1Obd: r1 }, ctx);
    const center = out.intervals.find((i) => i.referenceTime.includes('09:57:20'));
    expect(center?.estimatedSpeedKmh).not.toBe(145);
    expect(center?.sourceQualityFlags).toContain('R1_INTERVAL_ONLY');
  });

  it('engine ignition dropout does not add shutdown authority fields', () => {
    const result = normalizeRows('2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', [
      engineIgnitionDropoutRow('2026-01-01T00:00:00Z'),
    ]);
    expect(result.observations[0]?.temporalConfidence).toBe('INTERVAL_ONLY');
    expect((result.observations[0] as { shutdownWhileDriving?: boolean }).shutdownWhileDriving).toBeUndefined();
  });

  it('snapshot determinism and combined input identity', () => {
    const a = normalizeRows('2026-01-01T00:00:00Z', '2026-01-01T00:00:05Z', wobSparseR1Rows('2026-01-01T00:00:00Z'));
    const b = normalizeRows('2026-01-01T00:00:00Z', '2026-01-01T00:00:05Z', wobSparseR1Rows('2026-01-01T00:00:00Z'));
    expect(a.snapshotIdentity.digest).toBe(b.snapshotIdentity.digest);
    const combined = computeDiV0CombinedInputEvidenceVersion([
      { channel: 'R1_OBD', inputEvidenceVersion: a.snapshotIdentity.inputEvidenceVersion },
    ]);
    expect(combined).toMatch(/^DI_V0_COMBINED_INPUT_IDENTITY_V0_1:sha256:/);
  });

});
