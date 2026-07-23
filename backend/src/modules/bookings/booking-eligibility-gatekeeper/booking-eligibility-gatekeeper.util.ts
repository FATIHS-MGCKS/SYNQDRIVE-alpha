import type { EffectiveRentalRequirement } from '@modules/rental-rules/rental-rules.types';
import type { CustomerEligibilityResult } from '@modules/customers/types/customer-eligibility.types';
import type { CustomerVerificationEligibilityStatus } from '@modules/customer-verification/types/customer-verification-eligibility.types';
import type { BookingRentalEligibilityResult } from '../booking-rental-eligibility.types';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';
import { BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE } from '../booking-rental-eligibility.types';
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
import {
  resolveFinalBookingEligibilityDecision,
  resolveVerificationDomainStatus,
  sortGateReasonsByPriority,
  type BookingEligibilityDomainContribution,
} from './booking-eligibility-decision.policy';

export {
  resolveAggregateGateStatus,
  resolveFinalBookingEligibilityDecision,
  sortGateReasonsByPriority,
} from './booking-eligibility-decision.policy';

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
): BookingEligibilityDomainContribution {
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
      mapCustomerMessageToCode(message),
      BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
      message,
    ),
  );

  const canProceedForStage = stageResult.canProceed;
  let status: BookingEligibilityGateStatus;
  if (!canProceedForStage) {
    status = 'NOT_ELIGIBLE';
  } else if (stageResult.requiredActions.length > 0) {
    status = 'MANUAL_APPROVAL_REQUIRED';
  } else {
    status = 'ELIGIBLE';
  }

  return {
    domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
    status,
    blockingReasons,
    warnings,
  };
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
): BookingEligibilityDomainContribution {
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

  const appendDocumentReason = (
    code: BookingEligibilityReasonCode,
    message: string,
    overridable = false,
  ) => {
    const target =
      stageBlockers.length > 0 ||
      code === BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REJECTED ||
      code === BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_REJECTED ||
      code === BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_EXPIRED ||
      code === BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_EXPIRED ||
      code === BOOKING_ELIGIBILITY_REASON_CODE.PROOF_OF_ADDRESS_REJECTED
        ? blockingReasons
        : warnings;
    target.push(
      reason(code, BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION, message, {
        overridable,
      }),
    );
  };

  const idCode = DOCUMENT_STATUS_CODE[verification.idDocument]?.id;
  if (idCode && verification.idDocument !== 'verified') {
    appendDocumentReason(
      idCode,
      `ID document status: ${verification.idDocument}`,
      verification.idDocument === 'pickup_required',
    );
  }

  const licenseCode = DOCUMENT_STATUS_CODE[verification.drivingLicense]?.license;
  if (licenseCode && verification.drivingLicense !== 'verified') {
    appendDocumentReason(
      licenseCode,
      `Driving license status: ${verification.drivingLicense}`,
      verification.drivingLicense === 'pickup_required',
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

  const status = resolveVerificationDomainStatus(verification, stage, {
    blockingReasons,
    warnings,
  });

  return {
    domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
    status,
    blockingReasons,
    warnings,
  };
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
): BookingEligibilityDomainContribution {
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
    domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
    status: mapRentalEligibilityStatusToGateStatus(result.status),
    blockingReasons: [...blockingReasons, ...missingFieldReasons],
    warnings: [...warnings, ...manualApprovalReasons],
    missingFields: [...result.missingFields],
  };
}

export function assembleGateResult(input: {
  stage: BookingEligibilityGateStage;
  organizationId: string;
  customerId: string;
  vehicleId: string;
  bookingId?: string;
  contributions: BookingEligibilityDomainContribution[];
  sourceRuleIds: string[];
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
  const decision = resolveFinalBookingEligibilityDecision(input.contributions);

  return {
    status: decision.status,
    stage: input.stage,
    allowed:
      decision.status === 'ELIGIBLE' ||
      decision.status === 'MANUAL_APPROVAL_REQUIRED',
    reasonCodes: decision.reasonCodes,
    blockingReasons: decision.blockingReasons,
    warnings: decision.warnings,
    missingFields: decision.missingFields,
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

export function mapGatekeeperToAuthoritativeRentalPreview(
  gate: import('./booking-eligibility-gatekeeper.types').BookingEligibilityGateResult,
): BookingRentalEligibilityResult & {
  decisionAuthority: typeof import('./booking-eligibility-decision.policy').BOOKING_ELIGIBILITY_DECISION_AUTHORITY;
  gateStatus: BookingEligibilityGateStatus;
  reasonCodes: import('./booking-eligibility-gatekeeper.constants').BookingEligibilityReasonCode[];
} {
  const rental = gate.domains.rentalRules.result;
  const rentalCompatibleStatus =
    gate.status === 'TEMPORARILY_UNAVAILABLE' || gate.status === 'TECHNICAL_ERROR'
      ? 'NOT_ELIGIBLE'
      : gate.status;

  const manualApprovalReasons = [
    ...gate.warnings
      .filter((reason) => reason.overridable === true)
      .map((reason) => reason.message),
    ...(rental?.manualApprovalReasons ?? []),
  ];

  return {
    status: rentalCompatibleStatus as BookingRentalEligibilityResult['status'],
    blockingReasons: gate.blockingReasons.map((reason) => reason.message),
    warningReasons: gate.warnings
      .filter((reason) => reason.overridable !== true)
      .map((reason) => reason.message),
    missingFields: gate.missingFields,
    manualApprovalReasons: [...new Set(manualApprovalReasons)],
    effectiveRules:
      rental?.effectiveRules ??
      ({
        organizationId: gate.organizationId,
        vehicleId: gate.vehicleId,
        rentalCategoryId: null,
        rentalCategoryName: null,
        rentalCategoryType: null,
        rulesActive: false,
        activation: createActiveRentalRulesActivationSnapshot({
          organizationRulesActive: false,
          enforcementActive: false,
        }),
        minimumAgeYears: { value: null, source: null, sourceName: null },
        minimumLicenseHoldingMonths: { value: null, source: null, sourceName: null },
        depositAmountCents: { value: null, source: null, sourceName: null },
        depositAmount: { value: null, source: null, sourceName: null },
        depositCurrency: { value: 'EUR', source: null, sourceName: null },
        creditCardRequired: { value: false, source: null, sourceName: null },
        foreignTravelPolicy: { value: null, source: null, sourceName: null },
        additionalDriverPolicy: { value: null, source: null, sourceName: null },
        youngDriverPolicy: { value: null, source: null, sourceName: null },
        insuranceRequirement: { value: null, source: null, sourceName: null },
        manualApprovalRequired: { value: false, source: null, sourceName: null },
        notes: { value: null, source: null, sourceName: null },
        minimumLicenseHoldingYears: { value: null, source: null, sourceName: null },
        minimumLicenseHoldingRemainderMonths: { value: null, source: null, sourceName: null },
      } satisfies BookingRentalEligibilityResult['effectiveRules']),
    decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
    facts: rental?.facts ?? [],
    customerId: gate.customerId,
    vehicleId: gate.vehicleId,
    bookingId: gate.bookingId,
    decisionAuthority: 'GATEKEEPER',
    gateStatus: gate.status,
    reasonCodes: gate.reasonCodes,
  };
}
