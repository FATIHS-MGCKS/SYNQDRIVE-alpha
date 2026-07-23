import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import type { BookingRentalEligibilityResult } from './booking-rental-eligibility.types';
import type {
  BookingEligibilityGateResult,
  BookingEligibilityGateStatus,
} from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import type { ValidatedBookingEligibilityApproval } from './booking-eligibility-approval/booking-eligibility-approval.types';
import {
  assertBookingEligibilityTransitionAllowed,
  BOOKING_ELIGIBILITY_TRANSITION_CODE,
  resolveEligibilityPolicyMode,
  resolveGateStageForPolicyMode,
} from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';

export type BookingWizardEligibilityPreviewResult = {
  status: BookingEligibilityGateStatus;
  allowed: boolean;
  stage: BookingEligibilityGateResult['stage'];
  targetStatus: BookingStatus;
  blockingReasons: BookingEligibilityGateResult['blockingReasons'];
  warnings: BookingEligibilityGateResult['warnings'];
  missingFields: string[];
  previewFingerprint: string;
  engineVersion: string;
  evaluatedAt: string;
  /** Preview is informational only — final confirm always re-evaluates. */
  isPreviewOnly: true;
  rentalEligibility: BookingRentalEligibilityResult | null;
  canConfirm: boolean;
  canCreatePending: boolean;
};

export function buildEligibilityPreviewFingerprint(
  gateResult: BookingEligibilityGateResult,
): string {
  const payload = {
    engineVersion: gateResult.engineVersion,
    status: gateResult.status,
    sourceRuleIds: [...gateResult.sourceRuleIds].sort(),
    reasonCodes: [...gateResult.reasonCodes].sort(),
    missingFields: [...gateResult.missingFields].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function gateStatusAllowsPending(gateResult: BookingEligibilityGateResult): boolean {
  try {
    assertBookingEligibilityTransitionAllowed(gateResult, 'PENDING', {
      validatedApproval: null,
    });
    return true;
  } catch {
    return false;
  }
}

function gateStatusAllowsConfirm(
  gateResult: BookingEligibilityGateResult,
  options: { validatedApproval?: ValidatedBookingEligibilityApproval | null },
): boolean {
  try {
    assertBookingEligibilityTransitionAllowed(gateResult, 'CONFIRMED', {
      validatedApproval: options.validatedApproval ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export function mapGatekeeperToWizardPreview(
  gateResult: BookingEligibilityGateResult,
  targetStatus: BookingStatus,
  options: {
    validatedApproval?: ValidatedBookingEligibilityApproval | null;
  } = {},
): BookingWizardEligibilityPreviewResult {
  const rentalEligibility = gateResult.domains.rentalRules.result;
  const confirmGate = {
    ...gateResult,
    stage: resolveGateStageForPolicyMode('CONFIRMED'),
  };
  const pendingGate = {
    ...gateResult,
    stage: resolveGateStageForPolicyMode('PENDING'),
  };

  return {
    status: gateResult.status,
    allowed: gateResult.allowed,
    stage: gateResult.stage,
    targetStatus,
    blockingReasons: gateResult.blockingReasons,
    warnings: gateResult.warnings,
    missingFields: gateResult.missingFields,
    previewFingerprint: buildEligibilityPreviewFingerprint(gateResult),
    engineVersion: gateResult.engineVersion,
    evaluatedAt: gateResult.evaluatedAt,
    isPreviewOnly: true,
    rentalEligibility,
    canConfirm: gateStatusAllowsConfirm(confirmGate, {
      validatedApproval: options.validatedApproval ?? null,
    }),
    canCreatePending: gateStatusAllowsPending(pendingGate),
  };
}

export function resolveWizardGateStage(targetStatus: BookingStatus) {
  const mode = resolveEligibilityPolicyMode({
    targetStatus,
    isWizardDraft: false,
  });
  if (!mode || mode === 'DRAFT') {
    return resolveGateStageForPolicyMode('PENDING');
  }
  return resolveGateStageForPolicyMode(mode);
}

export function assertWizardPreviewFingerprintMatches(
  provided: string | undefined | null,
  fresh: BookingEligibilityGateResult,
): void {
  if (!provided?.trim()) return;
  const freshFingerprint = buildEligibilityPreviewFingerprint(fresh);
  if (provided.trim() !== freshFingerprint) {
    throw new ConflictException({
      code: BOOKING_ELIGIBILITY_TRANSITION_CODE.RULES_CHANGED,
      message:
        'Rental eligibility changed since the last preview — please review the updated requirements before confirming.',
      previewFingerprint: freshFingerprint,
      previousFingerprint: provided.trim(),
      eligibilityStatus: fresh.status,
      engineVersion: fresh.engineVersion,
      evaluatedAt: fresh.evaluatedAt,
      blockingReasons: fresh.blockingReasons,
      warnings: fresh.warnings,
      missingFields: fresh.missingFields,
    });
  }
}
