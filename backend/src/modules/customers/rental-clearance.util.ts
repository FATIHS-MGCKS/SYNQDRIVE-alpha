import type { CustomerEligibilityResult } from './types/customer-eligibility.types';

export type RentalClearanceStatus =
  | 'CLEARED'
  | 'PENDING'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type RentalClearanceSummary = {
  status: RentalClearanceStatus;
  label: string;
  reasons: string[];
};

/** Map canonical eligibility evaluation to a compact list-view badge. */
export function mapEligibilityToRentalClearance(
  result: CustomerEligibilityResult,
): RentalClearanceSummary {
  if (result.canStartRental) {
    return { status: 'CLEARED', label: 'Mietfreigabe', reasons: [] };
  }

  const hasHardBlock = result.blockingReasons.length > 0;
  const hasSoftSignals =
    result.warnings.length > 0 || result.requiredActions.length > 0;

  if (!hasHardBlock && hasSoftSignals) {
    return {
      status: 'REVIEW_REQUIRED',
      label: 'Prüfung nötig',
      reasons: [...result.warnings, ...result.requiredActions],
    };
  }

  if (
    result.canCreatePendingBooking &&
    (!result.canConfirmBooking || !result.canStartRental)
  ) {
    return {
      status: 'PENDING',
      label: 'Eingeschränkt',
      reasons: [
        ...result.blockingReasons,
        ...result.requiredActions,
        ...result.warnings,
      ],
    };
  }

  if (hasHardBlock) {
    return {
      status: 'BLOCKED',
      label: 'Nicht freigegeben',
      reasons: result.blockingReasons,
    };
  }

  return {
    status: 'REVIEW_REQUIRED',
    label: 'Prüfung nötig',
    reasons: [...result.warnings, ...result.requiredActions],
  };
}
