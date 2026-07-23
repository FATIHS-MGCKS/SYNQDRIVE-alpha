import type { BookingStatus } from '@prisma/client';
import type { BookingEligibilityGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import type { BookingEligibilityInvalidationFact } from '../booking-eligibility-gatekeeper/booking-eligibility-status-transition.matrix';
import type {
  BookingEligibilityRecheckTrigger,
  RetroactivityRecheckOutcome,
} from './booking-eligibility-retroactivity.constants';
import type { RetroactivityPolicyDecision } from './booking-eligibility-retroactivity.policy';

export interface BookingEligibilityRecheckContext {
  organizationId: string;
  bookingId: string;
  bookingStatus: BookingStatus;
  notes?: string | null;
  customerId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  paymentIntent?: unknown;
  extrasJson?: unknown;
}

export interface BookingEligibilityRecheckResult {
  bookingId: string;
  trigger: BookingEligibilityRecheckTrigger;
  policy: RetroactivityPolicyDecision;
  outcome: RetroactivityRecheckOutcome;
  priorRulesHash: string | null;
  currentRulesHash: string;
  ruleDriftDetected: boolean;
  gateResult?: Pick<BookingEligibilityGateResult, 'status' | 'allowed' | 'reasonCodes'>;
  decisionId?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface RulePublishRecheckInput {
  organizationId: string;
  publishedRevisionId: string;
  affectedBookingIds: string[];
  criticalRuleChange: boolean;
  correlationId: string;
}

export interface MutationRecheckInput {
  organizationId: string;
  bookingId: string;
  trigger: BookingEligibilityRecheckTrigger;
  invalidationFacts?: BookingEligibilityInvalidationFact[];
  actorUserId?: string | null;
}
