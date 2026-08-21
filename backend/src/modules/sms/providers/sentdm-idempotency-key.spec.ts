import { buildSentDmIdempotencyKey } from './sentdm-idempotency-key';

describe('buildSentDmIdempotencyKey', () => {
  it('is deterministic for org + business operation', () => {
    const a = buildSentDmIdempotencyKey('org-1', 'biz-123');
    const b = buildSentDmIdempotencyKey('org-1', 'biz-123');
    expect(a).toBe(b);
  });

  it('differs across organizations', () => {
    const a = buildSentDmIdempotencyKey('org-1', 'biz-123');
    const b = buildSentDmIdempotencyKey('org-2', 'biz-123');
    expect(a).not.toBe(b);
  });

  it('matches sent.dm key pattern', () => {
    const key = buildSentDmIdempotencyKey('org-1', 'biz-123');
    expect(key).toMatch(/^sdm_[a-f0-9]+$/);
    expect(key.length).toBeLessThanOrEqual(64);
  });
});
