import {
  providerMeasurementAlignsWithBucketSecond,
  resolveR1ObdFsmPointAuthority,
} from '../r1-obd-fsm-point-authority';

describe('resolveR1ObdFsmPointAuthority', () => {
  const bucket = '2026-10-22T18:47:58Z';
  const provenance = 'R1_DEVICE_MEASUREMENT' as const;

  it('denies DIRECT FSM authority for INTERVAL_ONLY R1 (bucket label is not measurement time)', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'INTERVAL_ONLY',
      bucketLabel: bucket,
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.measurementTimeUtc).toBeNull();
    expect(r.denialReason).toBe('R1_INTERVAL_ONLY_BUCKET_NOT_MEASUREMENT_INSTANT');
  });

  it('denies EXACT_PROVEN without provider measurement provenance', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: '2026-10-22T18:47:58.123Z',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MISSING_OR_INVALID_PROVIDER_MEASUREMENT_PROVENANCE');
  });

  it('denies EXACT_PROVEN with BUCKET_AGGREGATION_ONLY provenance', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: '2026-10-22T18:47:58.000Z',
      providerMeasurementProvenance: 'BUCKET_AGGREGATION_ONLY',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MISSING_OR_INVALID_PROVIDER_MEASUREMENT_PROVENANCE');
  });

  it('denies EXACT_PROVEN with invalid instant string', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: 'not-a-time',
      providerMeasurementProvenance: provenance,
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MEASUREMENT_INSTANT_OUTSIDE_BUCKET_SECOND');
  });

  it('denies measurement instant outside bucket second window', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: '2026-10-22T18:47:59.000Z',
      providerMeasurementProvenance: provenance,
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MEASUREMENT_INSTANT_OUTSIDE_BUCKET_SECOND');
  });

  it('accepts Z and .000Z instants equivalently when provenance and bucket alignment hold', () => {
    const instantZ = bucket;
    const instantMs = '2026-10-22T18:47:58.000Z';
    expect(providerMeasurementAlignsWithBucketSecond(bucket, instantZ)).toBe(true);
    expect(providerMeasurementAlignsWithBucketSecond(bucket, instantMs)).toBe(true);
    const rZ = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: instantZ,
      providerMeasurementProvenance: provenance,
    });
    const rMs = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: instantMs,
      providerMeasurementProvenance: provenance,
    });
    expect(rZ.fsmPointAuthority).toBe(true);
    expect(rMs.fsmPointAuthority).toBe(true);
    expect(rZ.measurementTimeUtc).toBe(instantZ);
    expect(rMs.measurementTimeUtc).toBe(instantMs);
    expect(rZ.denialReason).toBeNull();
    expect(rMs.denialReason).toBeNull();
  });
});
