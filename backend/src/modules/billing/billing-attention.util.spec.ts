import {
  buildBillingAttention,
  deriveBillingHealthFromAttention,
  deriveReconciliationHealth,
} from './billing-attention.util';

describe('billing-attention.util', () => {
  it('escalates to critical for past due and payment failure', () => {
    const attention = buildBillingAttention({
      warnings: ['PAST_DUE'],
      domainStatus: 'PAST_DUE',
      syncStatus: 'SYNCED',
      hasOpenDrift: false,
      hasFailedPayment: true,
      trialExpiringWithinDays: null,
      paymentMethodStatus: 'ACTIVE',
    });

    expect(attention.severity).toBe('critical');
    expect(attention.reasons).toContain('PAST_DUE');
    expect(attention.reasons).toContain('PAYMENT_FAILED');
    expect(deriveBillingHealthFromAttention(attention)).toBe('critical');
  });

  it('flags stripe mapping missing when sync is missing', () => {
    const attention = buildBillingAttention({
      warnings: [],
      domainStatus: 'ACTIVE',
      syncStatus: 'MISSING',
      hasOpenDrift: false,
      hasFailedPayment: false,
      trialExpiringWithinDays: null,
      paymentMethodStatus: 'MISSING',
    });

    expect(attention.reasons).toContain('STRIPE_MAPPING_MISSING');
    expect(attention.severity).toBe('critical');
  });

  it('marks trial expiring as info severity', () => {
    const attention = buildBillingAttention({
      warnings: [],
      domainStatus: 'TRIALING',
      syncStatus: 'SYNCED',
      hasOpenDrift: false,
      hasFailedPayment: false,
      trialExpiringWithinDays: 3,
      paymentMethodStatus: 'ACTIVE',
    });

    expect(attention.reasons).toContain('TRIAL_EXPIRING');
    expect(attention.severity).toBe('info');
    expect(deriveBillingHealthFromAttention(attention)).toBe('warning');
  });

  it('derives reconciliation health from sync and drifts', () => {
    expect(deriveReconciliationHealth('SYNCED', false)).toBe('ok');
    expect(deriveReconciliationHealth('PARTIAL', false)).toBe('warning');
    expect(deriveReconciliationHealth('SYNCED', true)).toBe('critical');
    expect(deriveReconciliationHealth('MISSING', false)).toBe('critical');
  });
});
