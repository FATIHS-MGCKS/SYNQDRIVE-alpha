import type { BookingStatus } from '@prisma/client';
import type { BookingEligibilityGateResult, BookingEligibilityGateStage } from './booking-eligibility-gatekeeper.types';
import type { ValidatedBookingEligibilityApproval } from '../booking-eligibility-approval/booking-eligibility-approval.types';
import type { BookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';
import {
  mapGateStatusToTransitionCode,
  throwBookingEligibilityViolation,
} from './booking-eligibility-error.policy';

export const BOOKING_ELIGIBILITY_TRANSITION_CODE = {
  NOT_ELIGIBLE: 'BOOKING_ELIGIBILITY_NOT_ELIGIBLE',
  MISSING_INFORMATION: 'BOOKING_ELIGIBILITY_MISSING_INFORMATION',
  MANUAL_APPROVAL_REQUIRED: 'BOOKING_ELIGIBILITY_MANUAL_APPROVAL_REQUIRED',
  TECHNICAL_ERROR: 'BOOKING_ELIGIBILITY_TECHNICAL_ERROR',
  TEMPORARILY_UNAVAILABLE: 'BOOKING_ELIGIBILITY_TEMPORARILY_UNAVAILABLE',
  RULES_CHANGED: 'BOOKING_ELIGIBILITY_RULES_CHANGED',
  OVERRIDE_DENIED: 'BOOKING_ELIGIBILITY_OVERRIDE_DENIED',
  OVERRIDE_REASON_REQUIRED: 'BOOKING_ELIGIBILITY_OVERRIDE_REASON_REQUIRED',
  APPROVAL_REQUIRED: 'BOOKING_ELIGIBILITY_APPROVAL_REQUIRED',
  APPROVAL_INVALID: 'BOOKING_ELIGIBILITY_APPROVAL_INVALID',
} as const;

export type BookingEligibilityTransitionPolicyMode = 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'ACTIVE';

export function resolveEligibilityPolicyMode(input: {
  targetStatus: BookingStatus;
  isWizardDraft: boolean;
}): BookingEligibilityTransitionPolicyMode | null {
  if (input.isWizardDraft && input.targetStatus === 'PENDING') {
    return 'DRAFT';
  }
  if (input.targetStatus === 'ACTIVE') {
    return 'ACTIVE';
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
  if (mode === 'ACTIVE') return 'PICKUP';
  return 'CREATE';
}

export function shouldSkipEligibilityEnforcement(mode: BookingEligibilityTransitionPolicyMode | null): boolean {
  return mode === null || mode === 'DRAFT';
}

export function assertBookingEligibilityTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  mode: BookingEligibilityTransitionPolicyMode,
  options: {
    validatedApproval?: ValidatedBookingEligibilityApproval | null;
    correlation?: BookingEligibilityCorrelationIds;
  },
): void {
  if (mode === 'DRAFT') return;

  const correlation = options.correlation ?? gateResult.correlation;

  if (mode === 'PENDING') {
    assertPendingTransitionAllowed(gateResult, correlation);
    return;
  }

  if (mode === 'ACTIVE') {
    assertActiveTransitionAllowed(gateResult, { ...options, correlation });
    return;
  }

  assertConfirmedTransitionAllowed(gateResult, { ...options, correlation });
}

function assertPendingTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  correlation?: BookingEligibilityCorrelationIds,
): void {
  switch (gateResult.status) {
    case 'ELIGIBLE':
    case 'MANUAL_APPROVAL_REQUIRED':
    case 'MISSING_INFORMATION':
      return;
    case 'NOT_ELIGIBLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        message: 'Booking cannot be created or updated while rental eligibility is not met.',
        gateResult,
        correlation,
      });
    case 'TECHNICAL_ERROR':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        message: 'Rental eligibility could not be evaluated — booking was not saved.',
        gateResult,
        correlation,
      });
    case 'TEMPORARILY_UNAVAILABLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE,
        message: 'Rental eligibility is temporarily unavailable — booking was not saved.',
        gateResult,
        correlation,
      });
    default:
      throwBookingEligibilityViolation({
        code: mapGateStatusToTransitionCode(gateResult.status),
        message: 'Rental eligibility could not be verified — booking was not saved.',
        gateResult,
        correlation,
      });
  }
}

function assertActiveTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  options: {
    validatedApproval?: ValidatedBookingEligibilityApproval | null;
    correlation?: BookingEligibilityCorrelationIds;
  },
): void {
  switch (gateResult.status) {
    case 'ELIGIBLE':
      return;
    case 'MANUAL_APPROVAL_REQUIRED': {
      if (!options.validatedApproval || options.validatedApproval.status !== 'APPROVED') {
        throwBookingEligibilityViolation({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.APPROVAL_REQUIRED,
          message: 'A valid eligibility approval is required before pickup can start.',
          gateResult,
          correlation: options.correlation,
          requiresOverride: true,
        });
      }
      if (options.validatedApproval.targetBookingStatus !== 'ACTIVE') {
        throwBookingEligibilityViolation({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.APPROVAL_INVALID,
          message: 'Eligibility approval does not cover pickup activation.',
          gateResult,
          correlation: options.correlation,
        });
      }
      return;
    }
    case 'NOT_ELIGIBLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        message: 'Pickup cannot start — rental eligibility requirements are not met.',
        gateResult,
        correlation: options.correlation,
      });
    case 'MISSING_INFORMATION':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION,
        message: 'Pickup cannot start — required eligibility information is missing.',
        gateResult,
        correlation: options.correlation,
      });
    case 'TECHNICAL_ERROR':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        message: 'Rental eligibility could not be evaluated — pickup was not started.',
        gateResult,
        correlation: options.correlation,
      });
    case 'TEMPORARILY_UNAVAILABLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE,
        message: 'Rental eligibility is temporarily unavailable — pickup was not started.',
        gateResult,
        correlation: options.correlation,
      });
    default:
      throwBookingEligibilityViolation({
        code: mapGateStatusToTransitionCode(gateResult.status),
        message: 'Rental eligibility could not be verified — pickup was not started.',
        gateResult,
        correlation: options.correlation,
      });
  }
}

function assertConfirmedTransitionAllowed(
  gateResult: BookingEligibilityGateResult,
  options: {
    validatedApproval?: ValidatedBookingEligibilityApproval | null;
    correlation?: BookingEligibilityCorrelationIds;
  },
): void {
  switch (gateResult.status) {
    case 'ELIGIBLE':
      return;
    case 'MANUAL_APPROVAL_REQUIRED': {
      if (!options.validatedApproval || options.validatedApproval.status !== 'APPROVED') {
        throwBookingEligibilityViolation({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.APPROVAL_REQUIRED,
          message: 'A valid eligibility approval is required before this booking can be confirmed.',
          gateResult,
          correlation: options.correlation,
          requiresOverride: true,
        });
      }
      if (options.validatedApproval.targetBookingStatus !== 'CONFIRMED') {
        throwBookingEligibilityViolation({
          code: BOOKING_ELIGIBILITY_TRANSITION_CODE.APPROVAL_INVALID,
          message: 'Eligibility approval does not cover booking confirmation.',
          gateResult,
          correlation: options.correlation,
        });
      }
      return;
    }
    case 'NOT_ELIGIBLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        message: 'Booking cannot be confirmed — rental eligibility requirements are not met.',
        gateResult,
        correlation: options.correlation,
      });
    case 'MISSING_INFORMATION':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION,
        message: 'Booking cannot be confirmed — required eligibility information is missing.',
        gateResult,
        correlation: options.correlation,
      });
    case 'TECHNICAL_ERROR':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        message: 'Rental eligibility could not be evaluated — booking was not confirmed.',
        gateResult,
        correlation: options.correlation,
      });
    case 'TEMPORARILY_UNAVAILABLE':
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE,
        message: 'Rental eligibility is temporarily unavailable — booking was not confirmed.',
        gateResult,
        correlation: options.correlation,
      });
    default:
      throwBookingEligibilityViolation({
        code: mapGateStatusToTransitionCode(gateResult.status),
        message: 'Rental eligibility could not be verified — booking was not confirmed.',
        gateResult,
        correlation: options.correlation,
      });
  }
}

export function isEligibilityRelevantBookingMutation(input: {
  customerIdChanged: boolean;
  vehicleIdChanged: boolean;
  datesChanged: boolean;
  paymentIntentChanged: boolean;
  extrasChanged: boolean;
  additionalDriversChanged?: boolean;
  statusChanged: boolean;
}): boolean {
  return (
    input.customerIdChanged ||
    input.vehicleIdChanged ||
    input.datesChanged ||
    input.paymentIntentChanged ||
    input.extrasChanged ||
    input.additionalDriversChanged === true ||
    input.statusChanged
  );
}
