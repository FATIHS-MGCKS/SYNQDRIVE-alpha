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

  const globalReasons = result.globalBlockingReasons ?? result.blockingReasons;

  if (globalReasons.length > 0) {
    return {
      status: 'BLOCKED',
      label: 'Nicht freigegeben',
      reasons: globalReasons,
    };
  }

  if (
    result.canCreatePendingBooking &&
    result.canConfirmBooking &&
    !result.canStartRental
  ) {
    return {
      status: 'REVIEW_REQUIRED',
      label: 'Pickup-Prüfung erforderlich',
      reasons: result.stages.startPickup.blockingReasons,
    };
  }

  if (!result.canConfirmBooking) {
    return {
      status: 'PENDING',
      label: 'Eingeschränkt',
      reasons: [
        ...result.stages.confirmBooking.blockingReasons,
        ...result.requiredActions,
        ...result.warnings,
      ],
    };
  }

  if (result.warnings.length > 0 || result.requiredActions.length > 0) {
    return {
      status: 'REVIEW_REQUIRED',
      label: 'Prüfung nötig',
      reasons: [...result.warnings, ...result.requiredActions],
    };
  }

  return {
    status: 'REVIEW_REQUIRED',
    label: 'Prüfung nötig',
    reasons: [...result.warnings, ...result.requiredActions],
  };
}
