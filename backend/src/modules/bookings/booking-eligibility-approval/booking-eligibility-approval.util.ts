import { createHash } from 'crypto';
import type { BookingStatus } from '@prisma/client';
import type { BookingEligibilityGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import { buildEligibilityPreviewFingerprint } from '../booking-wizard-eligibility.util';

export type BookingEligibilityApprovalDataContext = {
  customerId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  paymentIntent?: unknown;
  extrasJson?: unknown;
  additionalDriverCount?: number;
};

export function buildBookingEligibilityRuleRevision(
  gateResult: Pick<BookingEligibilityGateResult, 'engineVersion' | 'sourceRuleIds'>,
): string {
  const payload = {
    engineVersion: gateResult.engineVersion,
    sourceRuleIds: [...gateResult.sourceRuleIds].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildBookingEligibilityDataVersion(
  context: BookingEligibilityApprovalDataContext,
): string {
  const payload = {
    customerId: context.customerId,
    vehicleId: context.vehicleId,
    startDate: context.startDate.toISOString(),
    endDate: context.endDate.toISOString(),
    paymentIntent: context.paymentIntent ?? null,
    extrasJson: context.extrasJson ?? null,
    additionalDriverCount: context.additionalDriverCount ?? 0,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildBookingEligibilityFingerprint(
  gateResult: BookingEligibilityGateResult,
): string {
  return buildEligibilityPreviewFingerprint(gateResult);
}

export function resolveApprovalTargetStatus(input: {
  requested?: BookingStatus | null;
  bookingStatus: BookingStatus;
}): 'CONFIRMED' | 'ACTIVE' {
  if (input.requested === 'ACTIVE') return 'ACTIVE';
  if (input.requested === 'CONFIRMED') return 'CONFIRMED';
  if (input.bookingStatus === 'CONFIRMED') return 'ACTIVE';
  return 'CONFIRMED';
}

export function resolveApprovalGateStage(
  targetStatus: 'CONFIRMED' | 'ACTIVE',
): 'CONFIRM' | 'PICKUP' {
  return targetStatus === 'ACTIVE' ? 'PICKUP' : 'CONFIRM';
}

export function buildGateResultSnapshot(gateResult: BookingEligibilityGateResult) {
  return {
    status: gateResult.status,
    stage: gateResult.stage,
    reasonCodes: gateResult.reasonCodes,
    blockingReasons: gateResult.blockingReasons,
    warnings: gateResult.warnings,
    missingFields: gateResult.missingFields,
    engineVersion: gateResult.engineVersion,
    evaluatedAt: gateResult.evaluatedAt,
    correlation: gateResult.correlation,
  };
}
