import type {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalYoungDriverPolicy,
} from '@prisma/client';
import type { EffectiveRentalRules } from '@modules/rental-rules/rental-rules.types';
import {
  isRentalRulesEnforcementActive,
  RENTAL_RULES_ACTIVATION_WARNING,
} from '@modules/rental-rules/rental-rules-activation.policy';
import type {
  BookingRentalEligibilityResult,
  BookingRentalEligibilityStatus,
} from './booking-rental-eligibility.types';
import { YOUNG_DRIVER_MAX_AGE_YEARS } from './booking-rental-eligibility.types';
import { parseLicenseIssuedAtFromExtractedJson } from '@shared/utils/license-issued-at.util';

export { parseLicenseIssuedAtFromExtractedJson };

export function calculateAgeAtDate(dateOfBirth: Date, at: Date): number {
  let age = at.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = at.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

export function monthsBetween(start: Date, end: Date): number {
  let months = (end.getFullYear() - start.getFullYear()) * 12;
  months += end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export function isYoungDriver(age: number, minimumAgeYears: number | null): boolean {
  const minAge = minimumAgeYears ?? 18;
  return age >= minAge && age < YOUNG_DRIVER_MAX_AGE_YEARS;
}

export interface EligibilityEvaluationContext {
  rules: EffectiveRentalRules;
  formattedRules: BookingRentalEligibilityResult['effectiveRules'];
  customerAge: number | null;
  licenseHoldingMonths: number | null;
  hasDateOfBirth: boolean;
  hasLicenseIssuedAt: boolean;
  /** Unverified OCR/KYC suggestion exists for date of birth — cannot bind approve/reject. */
  unverifiedDateOfBirthPending?: boolean;
  /** Unverified OCR/KYC suggestion exists for license issue date — cannot bind approve/reject. */
  unverifiedLicenseIssuedAtPending?: boolean;
  paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  /** @deprecated */
  paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  foreignTravelRequested: boolean;
  additionalDriverCount: number;
  depositReceived: boolean;
}

export function evaluateRentalEligibilityChecks(
  ctx: EligibilityEvaluationContext,
): Pick<
  BookingRentalEligibilityResult,
  | 'blockingReasons'
  | 'warningReasons'
  | 'missingFields'
  | 'manualApprovalReasons'
  | 'status'
> {
  const activationWarnings = ctx.rules.activation?.informationalWarnings ?? [];

  if (!isRentalRulesEnforcementActive(ctx.rules.activation, ctx.rules.rulesActive)) {
    return {
      status: 'ELIGIBLE',
      blockingReasons: [],
      warningReasons: [
        RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_INACTIVE,
        ...activationWarnings.filter(
          (w) => w !== RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_INACTIVE,
        ),
      ],
      missingFields: [],
      manualApprovalReasons: [],
    };
  }

  const blockingReasons: string[] = [];
  const warningReasons: string[] = [...activationWarnings];
  const missingFields: string[] = [];
  const manualApprovalReasons: string[] = [];

  const minAge = ctx.rules.minimumAgeYears.value;
  if (minAge != null) {
    if (!ctx.hasDateOfBirth) {
      if (ctx.unverifiedDateOfBirthPending) {
        manualApprovalReasons.push(
          'Date of birth is available from unverified document data and requires manual review before eligibility can be confirmed.',
        );
      } else {
        missingFields.push('customer.dateOfBirth');
      }
    } else if (ctx.customerAge != null && ctx.customerAge < minAge) {
      blockingReasons.push(
        `Customer is ${ctx.customerAge} years old but this vehicle requires minimum age ${minAge}.`,
      );
    }
  }

  const minLicenseMonths = ctx.rules.minimumLicenseHoldingMonths.value;
  if (minLicenseMonths != null && minLicenseMonths > 0) {
    if (!ctx.hasLicenseIssuedAt) {
      if (ctx.unverifiedLicenseIssuedAtPending) {
        manualApprovalReasons.push(
          'License issue date is available from unverified document data and requires manual review before eligibility can be confirmed.',
        );
      } else {
        missingFields.push('customer.licenseIssuedAt');
      }
    } else if (
      ctx.licenseHoldingMonths != null &&
      ctx.licenseHoldingMonths < minLicenseMonths
    ) {
      const years = Math.round((minLicenseMonths / 12) * 10) / 10;
      blockingReasons.push(
        `Customer has held a license for ${ctx.licenseHoldingMonths} month(s) but this vehicle requires at least ${minLicenseMonths} month(s) (${years} year(s)).`,
      );
    }
  }

  if (ctx.rules.creditCardRequired.value === true) {
    const intent = ctx.paymentIntent ?? ctx.paymentMethod;
    if (intent && intent !== 'payment_link') {
      blockingReasons.push('This vehicle requires online payment by card (payment link).');
    } else if (!intent) {
      warningReasons.push('Online card payment via payment link is required for this vehicle.');
    }
  }

  const depositCents = ctx.rules.depositAmountCents.value;
  if (depositCents != null && depositCents > 0 && !ctx.depositReceived) {
    const amount = (depositCents / 100).toFixed(2);
    const currency = ctx.rules.depositCurrency.value ?? 'EUR';
    warningReasons.push(
      `A deposit of ${amount} ${currency} will be required before or at pickup.`,
    );
  }

  if (ctx.foreignTravelRequested) {
    applyPolicyCheck(
      ctx.rules.foreignTravelPolicy.value,
      'Foreign travel',
      blockingReasons,
      manualApprovalReasons,
    );
  }

  if (ctx.additionalDriverCount > 0) {
    applyPolicyCheck(
      ctx.rules.additionalDriverPolicy.value,
      'Additional drivers',
      blockingReasons,
      manualApprovalReasons,
      ctx.additionalDriverCount,
    );
  }

  if (
    ctx.customerAge != null &&
    isYoungDriver(ctx.customerAge, ctx.rules.minimumAgeYears.value)
  ) {
    applyYoungDriverPolicy(
      ctx.rules.youngDriverPolicy.value,
      blockingReasons,
      warningReasons,
      manualApprovalReasons,
    );
  }

  if (ctx.rules.manualApprovalRequired.value === true) {
    manualApprovalReasons.push(
      'Manual operator approval is required for this vehicle category.',
    );
  }

  const status = resolveEligibilityStatus({
    missingFields,
    blockingReasons,
    manualApprovalReasons,
  });

  return {
    status,
    blockingReasons,
    warningReasons,
    missingFields,
    manualApprovalReasons,
  };
}

function applyPolicyCheck(
  policy: RentalForeignTravelPolicy | RentalAdditionalDriverPolicy | null,
  label: string,
  blockingReasons: string[],
  manualApprovalReasons: string[],
  count?: number,
): void {
  if (policy === 'NOT_ALLOWED') {
    const suffix = count != null && count > 1 ? ` (${count} requested)` : '';
    blockingReasons.push(`${label} is not allowed for this vehicle${suffix}.`);
  } else if (policy === 'APPROVAL_REQUIRED') {
    const suffix = count != null ? ` (${count} requested)` : '';
    manualApprovalReasons.push(`${label} requires manual approval${suffix}.`);
  }
}

function applyYoungDriverPolicy(
  policy: RentalYoungDriverPolicy | null,
  blockingReasons: string[],
  warningReasons: string[],
  manualApprovalReasons: string[],
): void {
  if (policy === 'NOT_ALLOWED') {
    blockingReasons.push(
      `Young drivers under ${YOUNG_DRIVER_MAX_AGE_YEARS} are not allowed for this vehicle.`,
    );
  } else if (policy === 'FEE_REQUIRED') {
    warningReasons.push(
      `Young driver surcharge may apply for drivers under ${YOUNG_DRIVER_MAX_AGE_YEARS} (pricing is calculated separately).`,
    );
  } else if (policy === 'ALLOWED') {
    // no-op
  }
}

export function resolveEligibilityStatus(input: {
  missingFields: string[];
  blockingReasons: string[];
  manualApprovalReasons: string[];
}): BookingRentalEligibilityStatus {
  if (input.missingFields.length > 0) {
    return 'MISSING_INFORMATION';
  }
  if (input.blockingReasons.length > 0) {
    return 'NOT_ELIGIBLE';
  }
  if (input.manualApprovalReasons.length > 0) {
    return 'MANUAL_APPROVAL_REQUIRED';
  }
  return 'ELIGIBLE';
}
