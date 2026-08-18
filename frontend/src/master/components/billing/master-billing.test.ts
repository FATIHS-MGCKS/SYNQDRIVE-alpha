import { describe, expect, it } from 'vitest';
import { attentionReasonLabel, domainStatusLabel } from '../../billing/billing.utils';
import { MASTER_BILLING_RECONCILIATION_TABS } from './master-billing-navigation';

describe('master billing module', () => {
  it('maps attention codes to German labels', () => {
    expect(attentionReasonLabel('PAST_DUE')).toBe('Überfällig');
    expect(attentionReasonLabel('RECONCILIATION_DRIFT')).toBe('Abgleichsabweichung');
  });

  it('maps domain status labels', () => {
    expect(domainStatusLabel('TRIALING')).toBe('Testphase');
    expect(domainStatusLabel('ACTIVE')).toBe('Aktiv');
  });

  it('defines reconciliation sub tabs', () => {
    expect(MASTER_BILLING_RECONCILIATION_TABS.map((tab) => tab.id)).toEqual([
      'drifts',
      'platform-sync',
      'webhooks',
    ]);
  });
});
