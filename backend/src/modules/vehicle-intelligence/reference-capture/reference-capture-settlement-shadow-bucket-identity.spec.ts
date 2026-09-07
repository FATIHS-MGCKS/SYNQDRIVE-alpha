import {
  areSameSecondDifferentSubMs,
  buildExp021BucketFingerprint,
  buildExp021BucketIdentity,
  CANONICAL_EXP021_BUCKET_IDENTITY,
} from './reference-capture-settlement-shadow-bucket-identity';

describe('reference-capture-settlement-shadow-bucket-identity', () => {
  it('uses canonical FIELD_PIPE_CANONICAL_ISO_MS identity', () => {
    expect(CANONICAL_EXP021_BUCKET_IDENTITY).toBe('FIELD_PIPE_CANONICAL_ISO_MS');
    const a = buildExp021BucketIdentity('speed', '2026-09-07T04:40:00.123Z');
    const b = buildExp021BucketIdentity('speed', '2026-09-07T04:40:00.123Z');
    expect(a).toBe('speed|2026-09-07T04:40:00.123Z');
    expect(a).toBe(b);
    expect(buildExp021BucketFingerprint('speed', '2026-09-07T04:40:00.123Z')).toHaveLength(64);
  });

  it('distinguishes different-second buckets', () => {
    const a = buildExp021BucketIdentity('speed', '2026-09-07T04:40:00.999Z');
    const b = buildExp021BucketIdentity('speed', '2026-09-07T04:40:01.000Z');
    expect(a).not.toBe(b);
  });

  it('collapses sub-second variation to canonical ISO ms', () => {
    expect(
      areSameSecondDifferentSubMs(
        '2026-09-07T04:40:00.123Z',
        '2026-09-07T04:40:00.987Z',
      ),
    ).toBe(true);
    expect(
      buildExp021BucketIdentity('speed', '2026-09-07T04:40:00.123Z'),
    ).not.toBe(buildExp021BucketIdentity('speed', '2026-09-07T04:40:00.987Z'));
  });
});
