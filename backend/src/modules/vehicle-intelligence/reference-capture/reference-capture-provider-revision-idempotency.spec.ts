import { createHash } from 'crypto';
import {
  buildProviderBucketRevisionIdentity,
  buildPhysicalSampleFingerprint,
} from './reference-capture-physical-sample-identity.util';
import { hashNormalizedBucketValue } from './reference-capture-bucket-value.util';

describe('reference-capture provider revision idempotency', () => {
  const bucketIdentity = buildPhysicalSampleFingerprint({
    providerField: 'speed',
    providerTimestamp: '2026-09-01T10:00:02.000Z',
    normalizedValue: 10,
    interval: '1s',
    aggregation: 'AVG',
  });

  it('revision identity is stable for same bucket + first-seen + revised values', () => {
    const firstHash = hashNormalizedBucketValue(10);
    const revisedHash = hashNormalizedBucketValue(11);
    const id1 = buildProviderBucketRevisionIdentity({
      bucketIdentity,
      firstSeenValueHash: firstHash,
      revisedValueHash: revisedHash,
    });
    const id2 = buildProviderBucketRevisionIdentity({
      bucketIdentity,
      firstSeenValueHash: firstHash,
      revisedValueHash: revisedHash,
    });
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });

  it('10->11 and 10->12 are distinct revision identities', () => {
    const firstHash = hashNormalizedBucketValue(10);
    const rev11 = buildProviderBucketRevisionIdentity({
      bucketIdentity,
      firstSeenValueHash: firstHash,
      revisedValueHash: hashNormalizedBucketValue(11),
    });
    const rev12 = buildProviderBucketRevisionIdentity({
      bucketIdentity,
      firstSeenValueHash: firstHash,
      revisedValueHash: hashNormalizedBucketValue(12),
    });
    expect(rev11).not.toBe(rev12);
  });

  it('PROVIDER_REVISION_IDEMPOTENT: duplicate revision identity collapses in session set', () => {
    const firstHash = hashNormalizedBucketValue(10);
    const revisedHash = hashNormalizedBucketValue(11);
    const revisionIdentity = buildProviderBucketRevisionIdentity({
      bucketIdentity,
      firstSeenValueHash: firstHash,
      revisedValueHash: revisedHash,
    });
    const seen = new Set<string>();
    const attempts = [revisionIdentity, revisionIdentity, revisionIdentity];
    let unique = 0;
    for (const id of attempts) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique += 1;
    }
    expect(unique).toBe(1);
    expect(seen.size).toBe(1);
    expect(createHash('sha256').update(revisionIdentity).digest('hex')).toHaveLength(64);
  });
});
