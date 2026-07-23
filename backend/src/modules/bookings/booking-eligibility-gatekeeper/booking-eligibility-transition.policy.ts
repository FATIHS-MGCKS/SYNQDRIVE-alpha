import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import type { BookingEligibilityGateResult, BookingEligibilityGateStage } from './booking-eligibility-gatekeeper.types';

export const BOOKING_ELIGIBILITY_TRANSITION_CODE = {
  NOT_ELIGIBLE: 'BOOKING_ELIGIBILITY_NOT_ELIGIBLE',
  MISSING_INFORMATION: 'BOOKING_ELIGIBILITY_MISSING_INFORMATION',
  MANUAL_APPROVAL_REQUIRED: 'BOOKING_ELIGIBILITY_MANUAL_APPROVAL_REQUIRED',
  TECHNICAL_ERROR: 'BOOKING_ELIGIBILITY_TECHNICAL_ERROR',
  TEMPORARILY_UNAVAILABLE: 'BOOKING_ELIGIBILITY_TEMPORARILY_UNAVAILABLE',
  RULES_CHANGED: 'BOOKING_ELIGIBILITY_RULES_CHANGED',
  OVERRIDE_DENIED: 'BOOKING_ELIGIBILITY_OVERRIDE_DENIED',
  OVERRIDE_REASON_REQUIRED: 'BOOKING_ELIGIBILITY_OVERRIDE_REASON_REQUIRED',
} as const;

export type BookingEligibilityTransitionPolicyMode = 'DRAFT' | 'PENDING' | 'CONFIRMED';

export function resolveEligibilityPolicyMode(input: {
  targetStatus: BookingStatus;
  isWizardDraft: boolean;
}): BookingEligibilityTransitionPolicyMode | null {
  if (input.isWizardDraft && input.targetStatus === 'PENDING') {
    return 'DRAFT';
  }
  if (input.targetStatus === 'CONFIRMED') {
    return 'CONFIRMED';
  }
  if (input.targetStatus === 'PENDING') {
    return 'PENDING';
  }
  return null;
}

export function resolveGateStageForPolicyMode(
  mode: BookingEligibilityTransitionPolicyMode,
): BookingEligibilityGateStage {
  if (mode === 'CONFIRMED') return 'CONFIRM';
  return 'CREATE';
}

export function shouldSkipEligibilityEnforcement(mode: BookingEligibilityTransitionPolicyMode | null): boolean {
  return mode === null || mode === 'DRAFT';
}

export function assertBookingEligibilityTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  mode: BookingEligibilityTransitionPolicyMode,
  options: {
    eligibilityOverrideReason?: string | null;
    hasOverridePermission: boolean;
  },
): void {
  if (mode === 'DRAFT') return;

  if (mode === 'PENDING') {
    assertPendingTransitionAllowed(gateResult);
    return;
  }

  assertConfirmedTransitionAllowed(gateResult, options);
}

function assertPendingTransitionAllowed(gateResult: BookingEligibilityGateResult): void {
  switch (gateResult.status) {
    case 'ELIGIBLE':
    case 'MANUAL_APPROVAL_REQUIRED':
    case 'MISSING_INFORMATION':
      return;
    case 'NOT_ELIGIBLE':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        'Booking cannot be created or updated while rental eligibility is not met.',
        gateResult,
      );
    case 'TECHNICAL_ERROR':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        'Rental eligibility could not be evaluated — booking was not saved.',
        gateResult,
      );
    case 'TEMPORARILY_UNAVAILABLE':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE,
        'Rental eligibility is temporarily unavailable — booking was not saved.',
        gateResult,
      );
    default:
      return;
  }
}

function assertConfirmedTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  options: {
    eligibilityOverrideReason?: string | null;
    hasOverridePermission: boolean;
  },
): void {
  switch (gateResult.status) {
    case 'ELIGIBLE':
      return;
    case 'MANUAL_APPROVAL_REQUIRED': {
      const reason = options.eligibilityOverrideReason?.trim();
      if (!reason) {
        throw new ConflictException({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED,
          message: 'Manual approval is required before this booking can be confirmed.',
          reasonCodes: gateResult.reasonCodes,
          blockingReasons: gateResult.blockingReasons,
          warnings: gateResult.warnings,
          missingFields: gateResult.missingFields,
          eligibilityStatus: gateResult.status,
          requiresOverride: true,
        });
      }
      if (!options.hasOverridePermission) {
        throw new ForbiddenException({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.OVERRIDE_DENIED,
          message: 'Missing permission to override rental eligibility manual approval.',
        });
      }
      return;
    }
    case 'NOT_ELIGIBLE':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        'Booking cannot be confirmed — rental eligibility requirements are not met.',
        gateResult,
      );
    case 'MISSING_INFORMATION':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION,
        'Booking cannot be confirmed — required eligibility information is missing.',
        gateResult,
      );
    case 'TECHNICAL_ERROR':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        'Rental eligibility could not be evaluated — booking was not confirmed.',
        gateResult,
      );
    case 'TEMPORARILY_UNAVAILABLE':
      throw buildEligibilityConflict(
        BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE,
        'Rental eligibility is temporarily unavailable — booking was not confirmed.',
        gateResult,
      );
    default:
      return;
  }
}

function buildEligibilityConflict(
  code: (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE],
  message: string,
  gateResult: BookingEligibilityGateResult,
) {
  return new ConflictException({
    code,
    message,
    reasonCodes: gateResult.reasonCodes,
    blockingReasons: gateResult.blockingReasons,
    warnings: gateResult.warnings,
    missingFields: gateResult.missingFields,
    eligibilityStatus: gateResult.status,
    engineVersion: gateResult.engineVersion,
    evaluatedAt: gateResult.evaluatedAt,
  });
}

export function isEligibilityRelevantBookingMutation(input: {
  customerIdChanged: boolean;
  vehicleIdChanged: boolean;
  datesChanged: boolean;
  paymentIntentChanged: boolean;
  extrasChanged: boolean;
  statusChanged: boolean;
}): boolean {
  return (
    input.customerIdChanged ||
    input.vehicleIdChanged ||
    input.datesChanged ||
    input.paymentIntentChanged ||
    input.extrasChanged ||
    input.statusChanged
  );
}
