import {
  computeAuditContentHash,
  truncateIpForAudit,
  truncateUserAgent,
} from '../util/booking-request-context.util';

describe('booking-request-context.util', () => {
  it('redacts IPv4 last octet for audit', () => {
    expect(truncateIpForAudit('203.0.113.42')).toBe('203.0.113.xxx');
  });

  it('truncates user agent', () => {
    const long = 'a'.repeat(300);
    expect(truncateUserAgent(long)?.length).toBe(256);
  });

  it('produces stable audit content hash', () => {
    const a = computeAuditContentHash({ b: 1, a: 2 });
    const b = computeAuditContentHash({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
