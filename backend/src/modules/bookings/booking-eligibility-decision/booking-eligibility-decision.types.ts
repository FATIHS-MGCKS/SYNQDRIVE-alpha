import type { BookingEligibilityDecisionEventType } from '@prisma/client';
import type { BookingEligibilityGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import type { BookingEligibilityApprovalDataContext } from '../booking-eligibility-approval/booking-eligibility-approval.util';

export interface BookingEligibilityDecisionView {
  id: string;
  organizationId: string;
  bookingId: string;
  eventType: BookingEligibilityDecisionEventType;
  decisionStatus: string;
  reasonCodes: string[];
  blockingReasons: Array<{ code: string; domain: string; message: string; overridable?: boolean }>;
  warnings: Array<{ code: string; domain: string; message: string; overridable?: boolean }>;
  missingFields: string[];
  evaluatedAt: string;
  recheckAt: string | null;
  engineVersion: string;
  ruleRevisionIds: string[];
  rulesHash: string;
  derivedFacts: Record<string, unknown>;
  dataSources: Record<string, unknown>;
  manualApprovalId: string | null;
  bookingDataVersion: string;
  correlationId: string;
  evaluationId: string | null;
  createdAt: string;
}

export interface AppendBookingEligibilityDecisionInput {
  organizationId: string;
  bookingId: string;
  eventType: BookingEligibilityDecisionEventType;
  gateResult: BookingEligibilityGateResult;
  bookingDataContext: BookingEligibilityApprovalDataContext;
  manualApprovalId?: string | null;
}

export interface AppendManualApprovalDecisionInput {
  organizationId: string;
  bookingId: string;
  eventType: 'MANUAL_APPROVAL_APPROVED' | 'MANUAL_APPROVAL_REJECTED';
  approval: {
    id: string;
    eligibilityDecision: string;
    reasonCodes: unknown;
    gateResultSnapshot: unknown;
    ruleRevision: string;
    bookingDataVersion: string;
    eligibilityFingerprint: string;
  };
  correlationId: string;
  evaluatedAt: string;
  engineVersion: string;
}

export interface AppendRecheckDecisionInput {
  organizationId: string;
  bookingId: string;
  eventType:
    | 'RULE_PUBLISH_RECHECK'
    | 'MUTATION_RECHECK'
    | 'SCHEDULED_RECHECK'
    | 'APPROVAL_EXPIRED_RECHECK';
  decisionStatus: string;
  correlationId: string;
  priorRulesHash: string | null;
  currentRulesHash: string;
  bookingDataVersion: string;
  derivedFacts: Record<string, unknown>;
  reasonCodes?: string[];
  recheckAt?: Date | null;
  engineVersion?: string;
}
