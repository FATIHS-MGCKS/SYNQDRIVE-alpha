import { buildExp021MaturationShadowJobId } from './reference-capture-exp021-maturation-shadow.constants';

describe('buildExp021MaturationShadowJobId', () => {
  const base = {
    windowFamilyId: 'family-1',
    windowStratumId: 'stratum-1',
    plannedAgeMs: 45_000,
  };

  it('is deterministic for same scientific identity', () => {
    const a = buildExp021MaturationShadowJobId(base);
    const b = buildExp021MaturationShadowJobId(base);
    expect(a).toBe(b);
    expect(a).toBe('rc-exp021-ms-family-1-stratum-1-45000');
  });

  it('does not include enrollmentEventId or random values', () => {
    const jobId = buildExp021MaturationShadowJobId(base);
    expect(jobId).not.toMatch(/enroll|uuid|random/i);
  });

  it('suffixes transport retry ordinal', () => {
    const jobId = buildExp021MaturationShadowJobId({ ...base, transportRetryOrdinal: 2 });
    expect(jobId).toBe('rc-exp021-ms-family-1-stratum-1-45000-retry-2');
  });
});
