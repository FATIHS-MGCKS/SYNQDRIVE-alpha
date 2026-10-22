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

  it('denies EXACT_PROVEN without a provider measurement instant', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: 'not-a-time',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('MEASUREMENT_INSTANT_OUTSIDE_BUCKET_SECOND');
  });

  it('denies when measurement instant equals bucket label string (no invented bucket time)', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: bucket,
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.denialReason).toBe('BUCKET_LABEL_USED_AS_MEASUREMENT_INSTANT');
  });

  it('accepts measurement instant inside bucket second including millisecond suffix', () => {
    expect(providerMeasurementAlignsWithBucketSecond(bucket, `${bucket.replace('Z', '.000Z')}`)).toBe(true);
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'EXACT_PROVEN',
      bucketLabel: bucket,
      providerMeasurementInstantUtc: '2026-10-22T18:47:58.000Z',
    });
    expect(r.fsmPointAuthority).toBe(true);
    expect(r.measurementTimeUtc).toBe('2026-10-22T18:47:58.000Z');
    expect(r.denialReason).toBeNull();
  });
});
