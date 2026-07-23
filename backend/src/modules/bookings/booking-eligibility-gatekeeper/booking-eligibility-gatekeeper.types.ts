import type { BookingStatus } from '@prisma/client';
import type { EffectiveRentalRequirement } from '@modules/rental-rules/rental-rules.types';
import type { CustomerEligibilityResult } from '@modules/customers/types/customer-eligibility.types';
import type { CustomerVerificationEligibilityStatus } from '@modules/customer-verification/types/customer-verification-eligibility.types';
import type { BookingRentalEligibilityResult } from '../booking-rental-eligibility.types';
import type {
  BookingEligibilityGateDomain,
  BookingEligibilityReasonCode,
} from './booking-eligibility-gatekeeper.constants';
import type { BookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';

/** Lifecycle stage for a booking transition decision. */
export type BookingEligibilityGateStage = 'CREATE' | 'CONFIRM' | 'PICKUP' | 'PREVIEW';

export type BookingEligibilityGateStatus =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MANUAL_APPROVAL_REQUIRED'
  | 'MISSING_INFORMATION'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'TECHNICAL_ERROR';

export interface BookingEligibilityGateReason {
  code: BookingEligibilityReasonCode;
  domain: BookingEligibilityGateDomain;
  message: string;
  /** Whether an authorized operator may override this reason (future enforcement). */
  overridable?: boolean;
  /** Rental rule layer reference when applicable. */
  sourceRuleId?: string;
}

export interface BookingEligibilityGateInput {
  organizationId: string;
  customerId: string;
  vehicleId: string;
  stage: BookingEligibilityGateStage;
  startDate: Date;
  endDate?: Date;
  bookingId?: string;
  requestedStatus?: BookingStatus;
  paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  foreignTravelRequested?: boolean;
  additionalDriverCount?: number;
  depositReceived?: boolean;
  /** When true, invokes Rental Health readiness evaluator (optional slice). */
  includeVehicleReadiness?: boolean;
  /** Reserved for Prompt 22 — pricing/deposit conflict evaluator. */
  includePricingDeposit?: boolean;
  /** Correlation IDs for evaluation, command, transition, and audit trail. */
  correlation?: BookingEligibilityCorrelationIds;
}

export interface BookingEligibilityCustomerSlice {
  evaluated: boolean;
  canProceedForStage: boolean;
  result: CustomerEligibilityResult | null;
  error?: string;
}

export interface BookingEligibilityVerificationSlice {
  evaluated: boolean;
  result: CustomerVerificationEligibilityStatus | null;
  error?: string;
}

export interface BookingEligibilityRentalRulesSlice {
  evaluated: boolean;
  result: BookingRentalEligibilityResult | null;
  error?: string;
}

export interface BookingEligibilityVehicleSlice {
  evaluated: boolean;
  vehicleFound: boolean;
  vehicleId: string;
  error?: string;
}

export interface BookingEligibilityVehicleReadinessSlice {
  evaluated: boolean;
  skipped: boolean;
  blocked: boolean;
  healthGateStatus?: 'OK' | 'BLOCKED' | 'UNAVAILABLE' | 'UNKNOWN';
  error?: string;
}

export interface BookingEligibilityPricingDepositSlice {
  evaluated: boolean;
  skipped: boolean;
  error?: string;
}

export interface BookingEligibilityGateResult {
  status: BookingEligibilityGateStatus;
  stage: BookingEligibilityGateStage;
  allowed: boolean;
  reasonCodes: BookingEligibilityReasonCode[];
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  missingFields: string[];
  sourceRuleIds: string[];
  evaluatedAt: string;
  recheckRequired: boolean;
  engineVersion: string;
  organizationId: string;
  customerId: string;
  vehicleId: string;
  bookingId?: string;
  correlation: BookingEligibilityCorrelationIds;
  domains: {
    customer: BookingEligibilityCustomerSlice;
    verification: BookingEligibilityVerificationSlice;
    rentalRules: BookingEligibilityRentalRulesSlice;
    vehicle: BookingEligibilityVehicleSlice;
    vehicleReadiness: BookingEligibilityVehicleReadinessSlice;
    pricingDeposit: BookingEligibilityPricingDepositSlice;
  };
}

/** Optional domain evaluator — used for future pricing/deposit integration. */
export interface BookingEligibilityDomainEvaluator {
  domain: BookingEligibilityGateDomain;
  evaluate(
    input: BookingEligibilityGateInput,
    context: {
      effectiveRules: EffectiveRentalRequirement | null;
    },
  ): Promise<{
    blockingReasons: BookingEligibilityGateReason[];
    warnings: BookingEligibilityGateReason[];
    status?: BookingEligibilityGateStatus;
    skipped?: boolean;
    error?: string;
  }>;
}
