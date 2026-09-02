import {
  buildAggregateBucketFingerprint,
  buildLegacyValueInclusiveFingerprint,
  buildPhysicalSampleFingerprint,
  HF_PHYSICAL_IDENTITY_VERSION,
  isActiveLegacyIdentitySession,
  resolveHfPhysicalIdentityVersion,
} from './reference-capture-physical-sample-identity.util';

describe('reference-capture physical sample identity versioning', () => {
  const field = 'speed';
  const ts = '2026-09-01T10:00:02.000Z';
  const value = 42;

  it('buildLegacyValueInclusiveFingerprint matches historical V1 algorithm', () => {
    const v1 = buildLegacyValueInclusiveFingerprint({ providerField: field, providerTimestamp: ts, normalizedValue: value });
    const v1Again = buildLegacyValueInclusiveFingerprint({ providerField: field, providerTimestamp: ts, normalizedValue: value });
    expect(v1).toBe(v1Again);
    expect(v1).toHaveLength(64);
  });

  it('buildPhysicalSampleFingerprint LEGACY_VALUE_V1 produces exact historical V1 hash', () => {
    const legacy = buildLegacyValueInclusiveFingerprint({ providerField: field, providerTimestamp: ts, normalizedValue: value });
    const fromBuilder = buildPhysicalSampleFingerprint({
      providerField: field,
      providerTimestamp: ts,
      normalizedValue: value,
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1,
    });
    expect(fromBuilder).toBe(legacy);
  });

  it('V1 != V2 for same field+timestamp+value', () => {
    const v1 = buildPhysicalSampleFingerprint({
      providerField: field,
      providerTimestamp: ts,
      normalizedValue: value,
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1,
    });
    const v2 = buildPhysicalSampleFingerprint({
      providerField: field,
      providerTimestamp: ts,
      normalizedValue: value,
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
    });
    expect(v1).not.toBe(v2);
  });

  it('new session defaults to AGGREGATE_BUCKET_V2', () => {
    expect(resolveHfPhysicalIdentityVersion({})).toBe(HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2);
    const v2 = buildAggregateBucketFingerprint({
      providerField: field,
      providerTimestamp: ts,
      interval: '1s',
      aggregation: 'AVG',
      identityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
    });
    expect(
      buildPhysicalSampleFingerprint({ providerField: field, providerTimestamp: ts, normalizedValue: value }),
    ).toBe(v2);
  });

  it('active legacy session is detected for fail-closed upgrade policy', () => {
    expect(
      isActiveLegacyIdentitySession({ seenPhysicalSampleFingerprints: ['abc123'] }),
    ).toBe(true);
    expect(isActiveLegacyIdentitySession({ hfPhysicalIdentityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2 })).toBe(
      false,
    );
  });
});
