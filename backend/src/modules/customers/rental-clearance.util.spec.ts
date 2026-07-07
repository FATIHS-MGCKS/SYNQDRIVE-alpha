import { mapEligibilityToRentalClearance } from './rental-clearance.util';
import type { CustomerEligibilityResult } from './types/customer-eligibility.types';

describe('mapEligibilityToRentalClearance', () => {
  const base = (overrides: Partial<CustomerEligibilityResult>): CustomerEligibilityResult => ({
    customerId: 'c1',
    canCreatePendingBooking: false,
    canConfirmBooking: false,
    canStartRental: false,
    blockingReasons: [],
    warnings: [],
    requiredActions: [],
    ...overrides,
  });

  it('maps canStartRental to CLEARED', () => {
    const summary = mapEligibilityToRentalClearance(
      base({ canStartRental: true, canConfirmBooking: true, canCreatePendingBooking: true }),
    );
    expect(summary).toEqual({
      status: 'CLEARED',
      label: 'Mietfreigabe',
      reasons: [],
    });
  });

  it('maps warnings without hard blocks to REVIEW_REQUIRED', () => {
    const summary = mapEligibilityToRentalClearance(
      base({ warnings: ['License expiring soon'] }),
    );
    expect(summary.status).toBe('REVIEW_REQUIRED');
    expect(summary.label).toBe('Prüfung nötig');
  });

  it('maps pending-only path to PENDING', () => {
    const summary = mapEligibilityToRentalClearance(
      base({
        canCreatePendingBooking: true,
        canConfirmBooking: false,
        canStartRental: false,
        blockingReasons: ['ID not verified'],
      }),
    );
    expect(summary.status).toBe('PENDING');
    expect(summary.label).toBe('Eingeschränkt');
  });

  it('maps hard blocks to BLOCKED', () => {
    const summary = mapEligibilityToRentalClearance(
      base({
        blockingReasons: ['Customer is blocked'],
        canCreatePendingBooking: false,
      }),
    );
    expect(summary.status).toBe('BLOCKED');
    expect(summary.label).toBe('Nicht freigegeben');
  });
});
