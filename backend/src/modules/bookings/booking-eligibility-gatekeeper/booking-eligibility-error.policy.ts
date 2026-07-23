import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
  BOOKING_ELIGIBILITY_REASON_CODE,
} from './booking-eligibility-gatekeeper.constants';
import type { BookingEligibilityGateResult, BookingEligibilityGateStatus } from './booking-eligibility-gatekeeper.types';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-transition.policy';
import type { BookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';
import type { BookingEligibilityTransitionPolicyMode } from './booking-eligibility-transition.policy';

export type BookingEligibilityEvaluationIntent = 'preview' | 'enforce';

export const BOOKING_ELIGIBILITY_HTTP_CATEGORY = {
  BUSINESS_CONFLICT: 409,
  PERMISSION_DENIED: 403,
  TECHNICAL_UNAVAILABLE: 503,
} as const;

export type BookingEligibilityHttpCategory =
  (typeof BOOKING_ELIGIBILITY_HTTP_CATEGORY)[keyof typeof BOOKING_ELIGIBILITY_HTTP_CATEGORY];

export function mapTransitionCodeToHttpCategory(
  code: (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE],
): BookingEligibilityHttpCategory {
  switch (code) {
    case BOOKING_ELIGIBILITY_TRANSITION_CODE.OVERRIDE_DENIED:
      return BOOKING_ELIGIBILITY_HTTP_CATEGORY.PERMISSION_DENIED;
    case BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR:
    case BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE:
      return BOOKING_ELIGIBILITY_HTTP_CATEGORY.TECHNICAL_UNAVAILABLE;
    default:
      return BOOKING_ELIGIBILITY_HTTP_CATEGORY.BUSINESS_CONFLICT;
  }
}

export function isRetryableEligibilityErrorCode(
  code: (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE],
): boolean {
  return (
    code === BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR ||
    code === BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE ||
    code === BOOKING_ELIGIBILITY_TRANSITION_CODE.RULES_CHANGED
  );
}

export function mapGateStatusToTransitionCode(
  status: BookingEligibilityGateStatus,
): (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE] {
  switch (status) {
    case 'NOT_ELIGIBLE':
      return BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE;
    case 'MISSING_INFORMATION':
      return BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION;
    case 'MANUAL_APPROVAL_REQUIRED':
      return BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED;
    case 'TEMPORARILY_UNAVAILABLE':
      return BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE;
    case 'TECHNICAL_ERROR':
    default:
      return BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR;
  }
}

export function shouldFailClosedForPolicyMode(
  mode: BookingEligibilityTransitionPolicyMode,
): boolean {
  return mode === 'CONFIRMED' || mode === 'ACTIVE';
}

export function buildEligibilityViolationBody(input: {
  code: (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE];
  message: string;
  gateResult?: BookingEligibilityGateResult | null;
  correlation?: BookingEligibilityCorrelationIds;
  requiresOverride?: boolean;
}) {
  return {
    code: input.code,
    message: input.message,
    category:
      input.code === BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR
        ? 'technical_error'
        : input.code === BOOKING_ELIGIBILITY_TRANSITION_CODE.TEMPORARILY_UNAVAILABLE
          ? 'temporarily_unavailable'
          : input.code === BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE
            ? 'not_eligible'
            : input.code === BOOKING_ELIGIBILITY_TRANSITION_CODE.MISSING_INFORMATION
              ? 'missing_information'
              : input.code === BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED
                ? 'manual_approval_required'
                : 'business_conflict',
    retryable: isRetryableEligibilityErrorCode(input.code),
    reasonCodes: input.gateResult?.reasonCodes ?? [],
    blockingReasons: input.gateResult?.blockingReasons ?? [],
    warnings: input.gateResult?.warnings ?? [],
    missingFields: input.gateResult?.missingFields ?? [],
    eligibilityStatus: input.gateResult?.status ?? 'TECHNICAL_ERROR',
    engineVersion: input.gateResult?.engineVersion,
    evaluatedAt: input.gateResult?.evaluatedAt,
    correlation: input.correlation
      ? {
          evaluationId: input.correlation.evaluationId,
          commandId: input.correlation.commandId,
          transitionId: input.correlation.transitionId,
          auditEventId: input.correlation.auditEventId,
        }
      : undefined,
    requiresOverride: input.requiresOverride ?? false,
  };
}

export function throwBookingEligibilityViolation(input: {
  code: (typeof BOOKING_ELIGIBILITY_TRANSITION_CODE)[keyof typeof BOOKING_ELIGIBILITY_TRANSITION_CODE];
  message: string;
  gateResult?: BookingEligibilityGateResult | null;
  correlation?: BookingEligibilityCorrelationIds;
  requiresOverride?: boolean;
}): never {
  const body = buildEligibilityViolationBody(input);
  const httpCategory = mapTransitionCodeToHttpCategory(input.code);

  if (httpCategory === BOOKING_ELIGIBILITY_HTTP_CATEGORY.PERMISSION_DENIED) {
    throw new ForbiddenException(body);
  }
  if (httpCategory === BOOKING_ELIGIBILITY_HTTP_CATEGORY.TECHNICAL_UNAVAILABLE) {
    throw new ServiceUnavailableException(body);
  }
  throw new ConflictException(body);
}

export function buildTechnicalFailureGateResult(input: {
  organizationId: string;
  customerId: string;
  vehicleId: string;
  bookingId?: string;
  stage: BookingEligibilityGateResult['stage'];
  message: string;
  domain?: string;
  correlation?: BookingEligibilityCorrelationIds;
}): BookingEligibilityGateResult {
  const evaluatedAt = new Date().toISOString();
  return {
    status: 'TECHNICAL_ERROR',
    stage: input.stage,
    allowed: false,
    reasonCodes: [BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR],
    blockingReasons: [
      {
        code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
        domain: 'system',
        message: input.message,
      },
    ],
    warnings: [],
    missingFields: [],
    sourceRuleIds: [],
    evaluatedAt,
    recheckRequired: true,
    engineVersion: BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
    organizationId: input.organizationId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    bookingId: input.bookingId,
    correlation: input.correlation ?? {
      evaluationId: 'elig-eval:unknown',
      commandId: 'elig-cmd:unknown',
      transitionId: 'elig-xn:unknown',
      auditEventId: 'elig-audit:unknown',
    },
    domains: {
      customer: { evaluated: false, canProceedForStage: false, result: null, error: input.message },
      verification: { evaluated: false, result: null, error: input.message },
      rentalRules: { evaluated: false, result: null, error: input.message },
      vehicle: { evaluated: false, vehicleFound: false, vehicleId: input.vehicleId, error: input.message },
      vehicleReadiness: { evaluated: false, skipped: true, blocked: true, healthGateStatus: 'UNAVAILABLE', error: input.message },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  };
}
