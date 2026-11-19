import {
  assembleCustomerEligibilityResult,
  createEligibilityBuckets,
} from '@modules/customers/types/customer-eligibility.types';
import type { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';

/**
 * P6-PR5C boundary: permissive customer policy domain so disposable Postgres wizard HTTP
 * tests exercise the real gatekeeper assembly while verification + rental rules use
 * documented stubs (not production CustomerEligibilityService policy stack).
 */
export function createP6Pr5cCustomerEligibilityStub(): Pick<
  CustomerEligibilityService,
  'evaluateForBooking'
> {
  return {
    evaluateForBooking: jest.fn(async (_organizationId, customerId) =>
      assembleCustomerEligibilityResult(customerId, createEligibilityBuckets(), {
        canCreatePendingBooking: true,
        canConfirmBooking: true,
        canStartRental: true,
      }),
    ),
  };
}