import { describe, expect, it } from '@jest/globals';
import {
  buildOrganizationAttention,
  classifyConnectivityHealth,
  deriveBillingHealth,
} from './organization-attention.util';
import { OrganizationStatus } from '@prisma/client';

describe('organization-attention.util', () => {
  it('aggregates billing and org status into attention', () => {
    const attention = buildOrganizationAttention({
      orgStatus: OrganizationStatus.SUSPENDED,
      billingWarnings: ['PAST_DUE'],
      syncStatus: 'PARTIAL',
      hasActiveSubscription: true,
      hasIntegrationError: false,
      connectivityHealth: 'ok',
      hasReconciliationDrift: false,
    });
    expect(attention.severity).toBe('critical');
    expect(attention.reasons).toContain('ORG_SUSPENDED');
    expect(attention.reasons).toContain('PAST_DUE');
  });

  it('classifies connectivity thresholds', () => {
    expect(
      classifyConnectivityHealth(10, { offline: 3, no_signal: 0 }),
    ).toBe('degraded');
    expect(
      classifyConnectivityHealth(10, { offline: 6, no_signal: 0 }),
    ).toBe('critical');
  });

  it('derives billing health from warnings', () => {
    expect(deriveBillingHealth(['PAST_DUE'], 'SYNCED')).toBe('critical');
    expect(deriveBillingHealth([], 'SYNCED')).toBe('ok');
    expect(deriveBillingHealth(['PAYMENT_METHOD_MISSING'], 'PARTIAL')).toBe('warning');
  });
});
