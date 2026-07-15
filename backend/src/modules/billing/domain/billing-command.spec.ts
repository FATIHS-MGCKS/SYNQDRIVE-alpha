import {
  BillingCommandErrorCode,
  hashBillingCommandRequest,
  sanitizeBillingAuditPayload,
} from './billing-command';

describe('billing-command domain', () => {
  it('hashes equivalent payloads with different key order identically', () => {
    const a = hashBillingCommandRequest({ priceVersionId: 'ver-1', lockVersion: 2 });
    const b = hashBillingCommandRequest({ lockVersion: 2, priceVersionId: 'ver-1' });
    expect(a).toBe(b);
  });

  it('detects payload mismatch via different hashes', () => {
    const a = hashBillingCommandRequest({ priceVersionId: 'ver-1' });
    const b = hashBillingCommandRequest({ priceVersionId: 'ver-2' });
    expect(a).not.toBe(b);
  });

  it('strips sensitive stripe fields from audit payloads', () => {
    const sanitized = sanitizeBillingAuditPayload({
      organizationId: 'org-1',
      clientSecret: 'sec_123',
      nested: { stripe_secret_key: 'sk_test', amountCents: 1000 },
    });
    expect(sanitized).toEqual({
      organizationId: 'org-1',
      nested: { amountCents: 1000 },
    });
  });
});
