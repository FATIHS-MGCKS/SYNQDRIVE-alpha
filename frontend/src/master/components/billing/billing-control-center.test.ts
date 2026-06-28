import { describe, expect, it } from 'vitest';
import { SubscriptionsView } from '../SubscriptionsView';
import { BillingControlCenter } from './BillingControlCenter';

describe('Master Admin billing navigation', () => {
  it('SubscriptionsView is a deprecated alias for BillingControlCenter', () => {
    expect(SubscriptionsView).toBe(BillingControlCenter);
  });
});
