import {
  providerMeasurementAlignsWithBucketSecond,
  resolveR1ObdFsmPointAuthority,
} from '../r1-obd-fsm-point-authority';

describe('resolveR1ObdFsmPointAuthority', () => {
  const bucket = '2026-10-22T18:47:58Z';

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

  it('denies EXACT_PROVEN with invalid instant string', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: 'not-a-time',
      providerMeasurementProvenance: 'R1_DEVICE_MEASUREMENT',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MEASUREMENT_INSTANT_OUTSIDE_BUCKET_SECOND');
  });

  it('denies when measurement instant equals bucket label string (no invented bucket time)', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: bucket,
      providerMeasurementProvenance: 'R1_DEVICE_MEASUREMENT',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('BUCKET_LABEL_USED_AS_MEASUREMENT_INSTANT');
  });

  it('accepts Z and .000Z instants equivalently when provenance and bucket alignment hold', () => {
    const instantZ = bucket;
    const instantMs = '2026-10-22T18:47:58.000Z';
    expect(providerMeasurementAlignsWithBucketSecond(bucket, instantMs)).toBe(true);
    const rZ = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: instantZ,
      providerMeasurementProvenance: 'R1_DEVICE_MEASUREMENT',
    });
    expect(rZ.fsmPointAuthority).toBe(false);
    const rMs = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: instantMs,
      providerMeasurementProvenance: 'R1_DEVICE_MEASUREMENT',
    });
    expect(rMs.fsmPointAuthority).toBe(true);
    expect(rMs.measurementTimeUtc).toBe(instantMs);
    expect(rMs.denialReason).toBeNull();
  });
});
