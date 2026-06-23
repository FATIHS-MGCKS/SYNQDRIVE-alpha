import type { EffectiveRentalRulesDto } from '../components/settings/rental-rules/rental-rules.types';

export type BookingRentalEligibilityStatus =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MANUAL_APPROVAL_REQUIRED'
  | 'MISSING_INFORMATION';

export interface BookingRentalEligibilityResult {
  status: BookingRentalEligibilityStatus;
  blockingReasons: string[];
  warningReasons: string[];
  missingFields: string[];
  manualApprovalReasons: string[];
  effectiveRules: EffectiveRentalRulesDto;
  decisionSource: string;
  customerId: string;
  vehicleId: string;
  bookingId?: string;
}

export interface BookingRentalEligibilityCheckInput {
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate?: string;
  paymentMethod?: 'card' | 'cash' | 'invoice';
  foreignTravelRequested?: boolean;
  additionalDriverCount?: number;
  depositReceived?: boolean;
}
