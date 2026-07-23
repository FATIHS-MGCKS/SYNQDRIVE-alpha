import type { BookingEligibilityApprovalStatus } from '@prisma/client';

export type BookingEligibilityApprovalView = {
  id: string;
  organizationId: string;
  bookingId: string;
  eligibilityDecision: string;
  exceptionReason: string;
  reasonCodes: string[];
  status: BookingEligibilityApprovalStatus;
  gateStage: string;
  targetBookingStatus: string;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decisionReason: string | null;
  eligibilityFingerprint: string;
  ruleRevision: string;
  bookingDataVersion: string;
  gateResultSnapshot: unknown;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string;
};

export type ValidatedBookingEligibilityApproval = {
  id: string;
  status: 'APPROVED';
  eligibilityFingerprint: string;
  ruleRevision: string;
  bookingDataVersion: string;
  targetBookingStatus: string;
  gateStage: string;
};
