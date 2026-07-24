import { describe, expect, it } from 'vitest';
import {
  buildCustomerDisplayLabel,
  canAccessEvaluationsSurface,
  formatVehicleLabel,
  pseudonymizeCustomerId,
  resolveEvaluationsPiiTier,
} from './evaluations-privacy';

describe('evaluations-privacy (frontend)', () => {
  it('gates Auswertungen on invoices.read', () => {
    expect(canAccessEvaluationsSurface({ canReadInvoices: true })).toBe(true);
    expect(canAccessEvaluationsSurface({ canReadInvoices: false })).toBe(false);
  });

  it('uses pseudonymous customer labels for non-admin tiers', () => {
    const tier = resolveEvaluationsPiiTier({
      membershipRole: 'WORKER',
      canReadInvoices: true,
      canReadCustomers: false,
    });
    expect(tier).toBe('pseudonymous');
    expect(
      buildCustomerDisplayLabel({
        id: 'cust-abc-123',
        displayLabel: 'Max Mustermann',
        tier,
      }),
    ).toBe(pseudonymizeCustomerId('cust-abc-123'));
  });

  it('masks license plates in rankings for pseudonymous tier', () => {
    const { primary } = formatVehicleLabel(
      { license: 'B-AB 1234', model: 'VW Golf' },
      'veh-1',
      'pseudonymous',
    );
    expect(primary).toBe('B-···34');
  });
});
