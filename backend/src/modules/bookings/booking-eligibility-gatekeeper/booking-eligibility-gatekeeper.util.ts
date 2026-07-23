import type { EffectiveRentalRequirement } from '@modules/rental-rules/rental-rules.types';
import type { CustomerEligibilityResult } from '@modules/customers/types/customer-eligibility.types';
import type { CustomerVerificationEligibilityStatus } from '@modules/customer-verification/types/customer-verification-eligibility.types';
import type { BookingRentalEligibilityResult } from '../booking-rental-eligibility.types';
import {
  BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
  BOOKING_ELIGIBILITY_GATE_DOMAIN,
  BOOKING_ELIGIBILITY_REASON_CODE,
  type BookingEligibilityReasonCode,
} from './booking-eligibility-gatekeeper.constants';
import type {
  BookingEligibilityGateReason,
  BookingEligibilityGateStage,
  BookingEligibilityGateStatus,
} from './booking-eligibility-gatekeeper.types';

const STATUS_PRIORITY: Record<BookingEligibilityGateStatus, number> = {
  TECHNICAL_ERROR: 0,
  TEMPORARILY_UNAVAILABLE: 1,
  MISSING_INFORMATION: 2,
  NOT_ELIGIBLE: 3,
  MANUAL_APPROVAL_REQUIRED: 4,
  ELIGIBLE: 5,
};

export function resolveAggregateGateStatus(
  statuses: BookingEligibilityGateStatus[],
): BookingEligibilityGateStatus {
  if (statuses.length === 0) return 'ELIGIBLE';
  return statuses.reduce((worst, current) =>
    STATUS_PRIORITY[current] < STATUS_PRIORITY[worst] ? current : worst,
  );
}

export function mapRentalEligibilityStatusToGateStatus(
  status: BookingRentalEligibilityResult['status'],
): BookingEligibilityGateStatus {
  return status;
}

export function collectSourceRuleIds(
  effectiveRules: EffectiveRentalRequirement | null | undefined,
): string[] {
  if (!effectiveRules) return [];
  const ids = new Set<string>();
  if (effectiveRules.organizationId) {
    ids.add(`org:${effectiveRules.organizationId}`);
  }
  if (effectiveRules.rentalCategoryId) {
    ids.add(`category:${effectiveRules.rentalCategoryId}`);
  }
  if (effectiveRules.vehicleId) {
    ids.add(`vehicle:${effectiveRules.vehicleId}`);
  }
  return [...ids];
}

function reason(
  code: BookingEligibilityReasonCode,
  domain: (typeof BOOKING_ELIGIBILITY_GATE_DOMAIN)[keyof typeof BOOKING_ELIGIBILITY_GATE_DOMAIN],
  message: string,
  extras?: Partial<Pick<BookingEligibilityGateReason, 'overridable' | 'sourceRuleId'>>,
): BookingEligibilityGateReason {
  return { code, domain, message, ...extras };
}

const CUSTOMER_MESSAGE_CODE_MAP: Array<{
  pattern: RegExp;
  code: BookingEligibilityReasonCode;
}> = [
  { pattern: /archived/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_ARCHIVED },
  { pattern: /blocked/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED },
  { pattern: /suspended/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_SUSPENDED },
  { pattern: /inactive/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_INACTIVE },
  { pattern: /under review/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_UNDER_REVIEW },
  { pattern: /high.?risk/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_HIGH_RISK },
  { pattern: /license expired/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_LICENSE_EXPIRED },
  { pattern: /id document expired/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_ID_EXPIRED },
  { pattern: /overdue invoice/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_OVERDUE_INVOICES },
  { pattern: /open fine/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_OPEN_FINES },
  { pattern: /not found/i, code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_NOT_FOUND },
];

function mapCustomerMessageToCode(message: string): BookingEligibilityReasonCode {
  for (const entry of CUSTOMER_MESSAGE_CODE_MAP) {
    if (entry.pattern.test(message)) return entry.code;
  }
  return BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_STAGE_BLOCKED;
}

export function mapCustomerEligibilityToGateReasons(
  result: CustomerEligibilityResult,
  stage: BookingEligibilityGateStage,
): {
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  status: BookingEligibilityGateStatus;
  canProceedForStage: boolean;
} {
  const stageResult =
    stage === 'CONFIRM'
      ? result.stages.confirmBooking
      : stage === 'PICKUP'
        ? result.stages.startPickup
        : result.stages.createBooking;

  const blockingReasons = stageResult.blockingReasons.map((message) =>
    reason(
      mapCustomerMessageToCode(message),
      BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
      message,
    ),
  );

  const warnings = [
    ...result.warnings,
    ...stageResult.warnings,
  ].map((message) =>
    reason(
      BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_STAGE_BLOCKED,
      BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
      message,
    ),
  );

  const canProceedForStage = stageResult.canProceed;
  const status: BookingEligibilityGateStatus = canProceedForStage
    ? warnings.length > 0
      ? 'ELIGIBLE'
      : 'ELIGIBLE'
    : 'NOT_ELIGIBLE';

  return { blockingReasons, warnings, status, canProceedForStage };
}

const DOCUMENT_STATUS_CODE: Record<
  string,
  { id?: BookingEligibilityReasonCode; license?: BookingEligibilityReasonCode }
> = {
  missing: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_MISSING,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_MISSING,
  },
  pending: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_PENDING,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PENDING,
  },
  rejected: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REJECTED,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_REJECTED,
  },
  expired: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_EXPIRED,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_EXPIRED,
  },
  requires_review: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REQUIRES_REVIEW,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_REQUIRES_REVIEW,
  },
  pickup_required: {
    id: BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_PICKUP_REQUIRED,
    license: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PICKUP_REQUIRED,
  },
};

export function mapVerificationToGateReasons(
  verification: CustomerVerificationEligibilityStatus,
  stage: BookingEligibilityGateStage,
): {
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
} {
  const blockingReasons: BookingEligibilityGateReason[] = [];
  const warnings: BookingEligibilityGateReason[] = [];

  const stageBlockers =
    stage === 'PICKUP'
      ? verification.pickupBlockingReasons
      : stage === 'CONFIRM'
        ? verification.confirmBlockingReasons
        : [];

  for (const message of stageBlockers) {
    blockingReasons.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_STAGE_BLOCKED,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        message,
      ),
    );
  }

  const idCode = DOCUMENT_STATUS_CODE[verification.idDocument]?.id;
  if (idCode && verification.idDocument !== 'verified') {
    const target = stageBlockers.length > 0 ? blockingReasons : warnings;
    target.push(
      reason(
        idCode,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        `ID document status: ${verification.idDocument}`,
        { overridable: verification.idDocument === 'pickup_required' },
      ),
    );
  }

  const licenseCode = DOCUMENT_STATUS_CODE[verification.drivingLicense]?.license;
  if (licenseCode && verification.drivingLicense !== 'verified') {
    const target = stageBlockers.length > 0 ? blockingReasons : warnings;
    target.push(
      reason(
        licenseCode,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        `Driving license status: ${verification.drivingLicense}`,
        { overridable: verification.drivingLicense === 'pickup_required' },
      ),
    );
  }

  if (verification.proofOfAddress === 'required') {
    warnings.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REQUIRED,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        'Proof of address required',
      ),
    );
  } else if (verification.proofOfAddress === 'pending') {
    warnings.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_PENDING,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        'Proof of address pending',
      ),
    );
  } else if (verification.proofOfAddress === 'rejected') {
    blockingReasons.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REJECTED,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        'Proof of address rejected',
      ),
    );
  } else if (verification.proofOfAddress === 'requires_review') {
    warnings.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REQUIRES_REVIEW,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        'Proof of address requires review',
      ),
    );
  }

  for (const message of verification.warnings) {
    warnings.push(
      reason(
        BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_STAGE_BLOCKED,
        BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        message,
      ),
    );
  }

  return { blockingReasons, warnings };
}

function mapRentalBlockingMessage(message: string): BookingEligibilityReasonCode {
  if (/minimum age|too young|years old/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.MINIMUM_AGE_NOT_MET;
  }
  if (/license for .* month/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_HOLDING_TOO_SHORT;
  }
  if (/payment link|card/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.CREDIT_CARD_REQUIRED;
  }
  if (/foreign travel.*not allowed/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.FOREIGN_TRAVEL_NOT_ALLOWED;
  }
  if (/foreign travel.*approval/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.FOREIGN_TRAVEL_APPROVAL_REQUIRED;
  }
  if (/additional driver.*not allowed/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.ADDITIONAL_DRIVER_NOT_ALLOWED;
  }
  if (/additional driver.*approval/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.ADDITIONAL_DRIVER_APPROVAL_REQUIRED;
  }
  if (/young driver.*not allowed/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.YOUNG_DRIVER_NOT_ALLOWED;
  }
  if (/young driver surcharge/i.test(message)) {
    return BOOKING_ELIGIBILITY_REASON_CODE.YOUNG_DRIVER_FEE_REQUIRED;
  }
  return BOOKING_ELIGIBILITY_REASON_CODE.RENTAL_MANUAL_APPROVAL_REQUIRED;
}

export function mapRentalEligibilityToGateReasons(
  result: BookingRentalEligibilityResult,
): {
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  missingFields: string[];
  status: BookingEligibilityGateStatus;
} {
  const sourceRuleIds = collectSourceRuleIds(result.effectiveRules);
  const categorySourceId = sourceRuleIds.find((id) => id.startsWith('category:'));

  const blockingReasons = result.blockingReasons.map((message) =>
    reason(
      mapRentalBlockingMessage(message),
      BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
      message,
      categorySourceId ? { sourceRuleId: categorySourceId } : undefined,
    ),
  );

  const warnings = result.warningReasons.map((message) => {
    const code =
      /inactive/i.test(message)
        ? BOOKING_ELIGIBILITY_REASON_CODE.RENTAL_RULES_INACTIVE
        : /deposit/i.test(message)
          ? BOOKING_ELIGIBILITY_REASON_CODE.DEPOSIT_REQUIRED
          : BOOKING_ELIGIBILITY_REASON_CODE.YOUNG_DRIVER_FEE_REQUIRED;
    return reason(code, BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES, message);
  });

  const manualApprovalReasons = result.manualApprovalReasons.map((message) =>
    reason(
      mapRentalBlockingMessage(message),
      BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
      message,
      { overridable: true, sourceRuleId: categorySourceId },
    ),
  );

  const missingFieldReasons = result.missingFields.map((field) => {
    const code =
      field === 'customer.dateOfBirth'
        ? BOOKING_ELIGIBILITY_REASON_CODE.MISSING_CUSTOMER_DATE_OF_BIRTH
        : field === 'customer.licenseIssuedAt'
          ? BOOKING_ELIGIBILITY_REASON_CODE.MISSING_CUSTOMER_LICENSE_ISSUED_AT
          : BOOKING_ELIGIBILITY_REASON_CODE.RENTAL_MANUAL_APPROVAL_REQUIRED;
    return reason(
      code,
      BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
      `Missing required field: ${field}`,
    );
  });

  return {
    blockingReasons: [...blockingReasons, ...missingFieldReasons],
    warnings: [...warnings, ...manualApprovalReasons],
    missingFields: [...result.missingFields],
    status: mapRentalEligibilityStatusToGateStatus(result.status),
  };
}

export function assembleGateResult(input: {
  stage: BookingEligibilityGateStage;
  organizationId: string;
  customerId: string;
  vehicleId: string;
  bookingId?: string;
  blockingReasons: BookingEligibilityGateReason[];
  warnings: BookingEligibilityGateReason[];
  missingFields: string[];
  sourceRuleIds: string[];
  domainStatuses: BookingEligibilityGateStatus[];
  evaluatedAt: Date;
  recheckRequired: boolean;
}): Pick<
  import('./booking-eligibility-gatekeeper.types').BookingEligibilityGateResult,
  | 'status'
  | 'stage'
  | 'allowed'
  | 'reasonCodes'
  | 'blockingReasons'
  | 'warnings'
  | 'missingFields'
  | 'sourceRuleIds'
  | 'evaluatedAt'
  | 'recheckRequired'
  | 'engineVersion'
  | 'organizationId'
  | 'customerId'
  | 'vehicleId'
  | 'bookingId'
> {
  const status = resolveAggregateGateStatus(input.domainStatuses);
  const reasonCodes = [
    ...new Set([
      ...input.blockingReasons.map((r) => r.code),
      ...input.warnings.map((r) => r.code),
    ]),
  ];

  return {
    status,
    stage: input.stage,
    allowed:
      status === 'ELIGIBLE' ||
      status === 'MANUAL_APPROVAL_REQUIRED',
    reasonCodes,
    blockingReasons: input.blockingReasons,
    warnings: input.warnings,
    missingFields: input.missingFields,
    sourceRuleIds: input.sourceRuleIds,
    evaluatedAt: input.evaluatedAt.toISOString(),
    recheckRequired: input.recheckRequired,
    engineVersion: BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
    organizationId: input.organizationId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    bookingId: input.bookingId,
  };
}

export function dedupeGateReasons(
  reasons: BookingEligibilityGateReason[],
): BookingEligibilityGateReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.code}|${reason.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
