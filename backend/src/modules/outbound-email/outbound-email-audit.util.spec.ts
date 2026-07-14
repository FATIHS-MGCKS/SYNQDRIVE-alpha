import { sanitizeOutboundErrorMessage, isRetryableOutboundEmail } from './outbound-email-audit.util';

describe('outbound-email-audit.util', () => {
  it('redacts bearer tokens and truncates long messages', () => {
    const long = 'x'.repeat(600);
    const result = sanitizeOutboundErrorMessage(`Bearer re_abc123secret ${long}`);
    expect(result).not.toContain('re_abc123secret');
    expect(result!.length).toBeLessThanOrEqual(500);
  });

  it('marks failed sends as retryable', () => {
    expect(
      isRetryableOutboundEmail({ status: 'FAILED', deliveryStatus: 'FAILED' }),
    ).toBe(true);
    expect(
      isRetryableOutboundEmail({ status: 'SENDING', deliveryStatus: 'PENDING' }),
    ).toBe(false);
  });
});
