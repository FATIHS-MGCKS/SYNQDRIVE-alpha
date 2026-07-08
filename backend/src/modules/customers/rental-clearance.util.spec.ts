import { mapEligibilityToRentalClearance } from './rental-clearance.util';
import type { CustomerEligibilityResult } from './types/customer-eligibility.types';
import {
  assembleCustomerEligibilityResult,
  createEligibilityBuckets,
  pushUniqueReason,
} from './types/customer-eligibility.types';

describe('mapEligibilityToRentalClearance', () => {
  const base = (overrides: Partial<CustomerEligibilityResult>): CustomerEligibilityResult => {
    const buckets = createEligibilityBuckets();
    if (overrides.globalBlockingReasons) {
      for (const reason of overrides.globalBlockingReasons) {
        pushUniqueReason(buckets.globalBlockingReasons, reason);
      }
    }
    return assembleCustomerEligibilityResult('c1', buckets, {
      canCreatePendingBooking: overrides.canCreatePendingBooking ?? false,
      canConfirmBooking: overrides.canConfirmBooking ?? false,
      canStartRental: overrides.canStartRental ?? false,
    });
  };

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
    const buckets = createEligibilityBuckets();
    buckets.warnings.push('License expiring soon');
    const summary = mapEligibilityToRentalClearance(
      assembleCustomerEligibilityResult('c1', buckets, {
        canCreatePendingBooking: true,
        canConfirmBooking: true,
        canStartRental: true,
      }),
    );
    expect(summary.status).toBe('CLEARED');
  });

  it('maps pickup-only block to Pickup-Prüfung erforderlich', () => {
    const buckets = createEligibilityBuckets();
    pushUniqueReason(
      buckets.pickupBlockingReasons,
      'Führerscheinprüfung für Pickup erforderlich',
    );
    const summary = mapEligibilityToRentalClearance(
      assembleCustomerEligibilityResult('c1', buckets, {
        canCreatePendingBooking: true,
        canConfirmBooking: true,
        canStartRental: false,
      }),
    );
    expect(summary.status).toBe('REVIEW_REQUIRED');
    expect(summary.label).toBe('Pickup-Prüfung erforderlich');
    expect(summary.label).not.toBe('Nicht freigegeben');
  });

  it('maps confirm block to PENDING / Eingeschränkt', () => {
    const buckets = createEligibilityBuckets();
    pushUniqueReason(
      buckets.confirmBlockingReasons,
      'Ausweisprüfung für Buchungsbestätigung erforderlich',
    );
    const summary = mapEligibilityToRentalClearance(
      assembleCustomerEligibilityResult('c1', buckets, {
        canCreatePendingBooking: true,
        canConfirmBooking: false,
        canStartRental: false,
      }),
    );
    expect(summary.status).toBe('PENDING');
    expect(summary.label).toBe('Eingeschränkt');
  });

  it('maps hard global blocks to BLOCKED', () => {
    const summary = mapEligibilityToRentalClearance(
      base({
        globalBlockingReasons: ['Customer is blocked'],
        canCreatePendingBooking: false,
      }),
    );
    expect(summary.status).toBe('BLOCKED');
    expect(summary.label).toBe('Nicht freigegeben');
  });
});
