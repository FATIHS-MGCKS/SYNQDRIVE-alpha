import type { EffectiveRentalRequirement } from '@modules/rental-rules/rental-rules.types';
import type { CustomerEligibilityFact } from '@modules/customer-verification/policies/customer-fact-trust.policy';

export type BookingRentalEligibilityStatus =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MANUAL_APPROVAL_REQUIRED'
  | 'MISSING_INFORMATION';

export const BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE = 'RENTAL_RULES_EFFECTIVE' as const;

/** Industry-default upper bound for "young driver" when no separate threshold exists in rental rules. */
export const YOUNG_DRIVER_MAX_AGE_YEARS = 25;

export interface BookingRentalEligibilityInput {
  organizationId: string;
  vehicleId: string;
  customerId: string;
  startDate: Date;
  endDate?: Date;
  paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  /** @deprecated */
  paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  foreignTravelRequested?: boolean;
  additionalDriverCount?: number;
  depositReceived?: boolean;
  bookingId?: string;
}

export interface BookingRentalEligibilityResult {
  status: BookingRentalEligibilityStatus;
  blockingReasons: string[];
  warningReasons: string[];
  missingFields: string[];
  manualApprovalReasons: string[];
  effectiveRules: EffectiveRentalRequirement;
  decisionSource: typeof BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE;
  /** Per-field provenance for binding rental-rule facts (no full document payloads). */
  facts: CustomerEligibilityFact[];
  customerId: string;
  vehicleId: string;
  bookingId?: string;
}
