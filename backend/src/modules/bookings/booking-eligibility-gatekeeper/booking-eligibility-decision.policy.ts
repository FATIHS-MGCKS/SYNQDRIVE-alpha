import {
  BOOKING_ELIGIBILITY_GATE_DOMAIN,
  BOOKING_ELIGIBILITY_REASON_CODE,
  type BookingEligibilityGateDomain,
  type BookingEligibilityReasonCode,
} from './booking-eligibility-gatekeeper.constants';
import type {
  BookingEligibilityGateReason,
  BookingEligibilityGateStage,
  BookingEligibilityGateStatus,
} from './booking-eligibility-gatekeeper.types';
import type { CustomerVerificationEligibilityStatus } from '@modules/customer-verification/types/customer-verification-eligibility.types';

/** Authoritative final decision producer for booking eligibility. */
export const BOOKING_ELIGIBILITY_DECISION_AUTHORITY = 'GATEKEEPER' as const;

/**
 * Final status priority — lower number wins (most restrictive).
 *
 * 1. System failures
 * 2. Hard blocks (customer ban, rejected documents, rental rule violations, vehicle blocked)
 * 3. Missing verified prerequisites
 * 4. Manual approval / policy deferrals
 * 5. Eligible (warnings may still be present)
 */
export const BOOKING_ELIGIBILITY_STATUS_PRIORITY: Record<
  BookingEligibilityGateStatus,
  number
> = {
  TECHNICAL_ERROR: 0,
  TEMPORARILY_UNAVAILABLE: 1,
  NOT_ELIGIBLE: 2,
  MISSING_INFORMATION: 3,
  MANUAL_APPROVAL_REQUIRED: 4,
  ELIGIBLE: 5,
};

/**
 * Presentation priority for reason codes — stable, translatable, reproducible ordering.
 * Lower number = higher priority in UI and audit logs.
 */
export const BOOKING_ELIGIBILITY_REASON_CODE_PRIORITY: Partial<
  Record<BookingEligibilityReasonCode, number>
> = {
  [BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR]: 10,
  [BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_READINESS_UNAVAILABLE]: 20,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED]: 100,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_ARCHIVED]: 101,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_SUSPENDED]: 102,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_INACTIVE]: 103,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_UNDER_REVIEW]: 110,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_HIGH_RISK]: 120,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_OVERDUE_INVOICES]: 130,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_OPEN_FINES]: 131,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REJECTED]: 200,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_REJECTED]: 201,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_EXPIRED]: 210,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_EXPIRED]: 211,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_LICENSE_EXPIRED]: 212,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_ID_EXPIRED]: 213,
  [BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REJECTED]: 220,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_MISSING]: 300,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_MISSING]: 301,
  [BOOKING_ELIGIBILITY_REASON_CODE.MISSING_CUSTOMER_DATE_OF_BIRTH]: 310,
  [BOOKING_ELIGIBILITY_REASON_CODE.MISSING_CUSTOMER_LICENSE_ISSUED_AT]: 311,
  [BOOKING_ELIGIBILITY_REASON_CODE.MINIMUM_AGE_NOT_MET]: 400,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_HOLDING_TOO_SHORT]: 401,
  [BOOKING_ELIGIBILITY_REASON_CODE.YOUNG_DRIVER_NOT_ALLOWED]: 402,
  [BOOKING_ELIGIBILITY_REASON_CODE.FOREIGN_TRAVEL_NOT_ALLOWED]: 403,
  [BOOKING_ELIGIBILITY_REASON_CODE.ADDITIONAL_DRIVER_NOT_ALLOWED]: 404,
  [BOOKING_ELIGIBILITY_REASON_CODE.CREDIT_CARD_REQUIRED]: 405,
  [BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_RENTAL_BLOCKED]: 410,
  [BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_NOT_FOUND]: 420,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REQUIRES_REVIEW]: 500,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_REQUIRES_REVIEW]: 501,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_PENDING]: 510,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PENDING]: 511,
  [BOOKING_ELIGIBILITY_REASON_CODE.FOREIGN_TRAVEL_APPROVAL_REQUIRED]: 520,
  [BOOKING_ELIGIBILITY_REASON_CODE.ADDITIONAL_DRIVER_APPROVAL_REQUIRED]: 521,
  [BOOKING_ELIGIBILITY_REASON_CODE.RENTAL_MANUAL_APPROVAL_REQUIRED]: 522,
  [BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REQUIRES_REVIEW]: 530,
  [BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_PICKUP_REQUIRED]: 600,
  [BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PICKUP_REQUIRED]: 601,
  [BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REQUIRED]: 610,
  [BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_PENDING]: 611,
  [BOOKING_ELIGIBILITY_REASON_CODE.DEPOSIT_REQUIRED]: 700,
  [BOOKING_ELIGIBILITY_REASON_CODE.YOUNG_DRIVER_FEE_REQUIRED]: 710,
  [BOOKING_ELIGIBILITY_REASON_CODE.RENTAL_RULES_INACTIVE]: 800,
  [BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_STAGE_BLOCKED]: 900,
};

export interface BookingEligibilityDomainContribution {
  domain: BookingEligibilityGateDomain;
  status: BookingEligibilityGateStatus;
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  missingFields?: string[];
}

export function resolveAggregateGateStatus(
  statuses: BookingEligibilityGateStatus[],
): BookingEligibilityGateStatus {
  if (statuses.length === 0) return 'ELIGIBLE';
  return statuses.reduce((worst, current) =>
    BOOKING_ELIGIBILITY_STATUS_PRIORITY[current] <
    BOOKING_ELIGIBILITY_STATUS_PRIORITY[worst]
      ? current
      : worst,
  );
}

export function resolveFinalBookingEligibilityDecision(
  contributions: BookingEligibilityDomainContribution[],
): {
  status: BookingEligibilityGateStatus;
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  missingFields: string[];
  reasonCodes: BookingEligibilityReasonCode[];
} {
  const status = resolveAggregateGateStatus(
    contributions.map((contribution) => contribution.status),
  );

  const blockingReasons = sortGateReasonsByPriority(
    contributions.flatMap((contribution) => contribution.blockingReasons),
  );
  const warnings = sortGateReasonsByPriority(
    contributions.flatMap((contribution) => contribution.warnings),
  );
  const missingFields = [
    ...new Set(
      contributions.flatMap((contribution) => contribution.missingFields ?? []),
    ),
  ];
  const reasonCodes = [
    ...new Set([
      ...blockingReasons.map((reason) => reason.code),
      ...warnings.map((reason) => reason.code),
    ]),
  ];

  return {
    status,
    blockingReasons,
    warnings,
    missingFields,
    reasonCodes,
  };
}

export function sortGateReasonsByPriority(
  reasons: BookingEligibilityGateReason[],
): BookingEligibilityGateReason[] {
  return [...reasons].sort((left, right) => {
    const leftPriority =
      BOOKING_ELIGIBILITY_REASON_CODE_PRIORITY[left.code] ?? 999;
    const rightPriority =
      BOOKING_ELIGIBILITY_REASON_CODE_PRIORITY[right.code] ?? 999;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.message.localeCompare(right.message);
  });
}

export function resolveVerificationDomainStatus(
  verification: CustomerVerificationEligibilityStatus,
  stage: BookingEligibilityGateStage,
  mapped: {
    blockingReasons: BookingEligibilityGateReason[];
    warnings: BookingEligibilityGateReason[];
  },
): BookingEligibilityGateStatus {
  if (mapped.blockingReasons.length > 0) {
    return 'NOT_ELIGIBLE';
  }

  const idStatus = verification.idDocument;
  const licenseStatus = verification.drivingLicense;

  if (
    idStatus === 'rejected' ||
    idStatus === 'expired' ||
    licenseStatus === 'rejected' ||
    licenseStatus === 'expired'
  ) {
    return 'NOT_ELIGIBLE';
  }

  if (stage === 'CONFIRM') {
    if (!verification.canConfirmBooking) {
      if (idStatus === 'missing' || licenseStatus === 'missing') {
        return 'MISSING_INFORMATION';
      }
      if (
        idStatus === 'pending' ||
        idStatus === 'requires_review' ||
        licenseStatus === 'pending' ||
        licenseStatus === 'requires_review'
      ) {
        return 'MANUAL_APPROVAL_REQUIRED';
      }
      return 'NOT_ELIGIBLE';
    }
  }

  if (stage === 'PICKUP') {
    if (!verification.canStartPickup) {
      if (idStatus === 'missing' || licenseStatus === 'missing') {
        return 'MISSING_INFORMATION';
      }
      if (
        idStatus === 'pending' ||
        idStatus === 'requires_review' ||
        licenseStatus === 'pending' ||
        licenseStatus === 'requires_review'
      ) {
        return 'MANUAL_APPROVAL_REQUIRED';
      }
      return 'NOT_ELIGIBLE';
    }
  }

  if (
    idStatus === 'pending' ||
    idStatus === 'requires_review' ||
    licenseStatus === 'pending' ||
    licenseStatus === 'requires_review'
  ) {
    return 'MANUAL_APPROVAL_REQUIRED';
  }

  if (idStatus === 'missing' || licenseStatus === 'missing') {
    return stage === 'CREATE' || stage === 'PREVIEW'
      ? 'ELIGIBLE'
      : 'MISSING_INFORMATION';
  }

  return 'ELIGIBLE';
}

export function isWarningOnlyVerificationReason(
  reason: BookingEligibilityGateReason,
): boolean {
  return (
    reason.domain === BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION &&
    (reason.code === BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_PICKUP_REQUIRED ||
      reason.code === BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PICKUP_REQUIRED ||
      reason.code === BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REQUIRED ||
      reason.code === BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_PENDING)
  );
}
