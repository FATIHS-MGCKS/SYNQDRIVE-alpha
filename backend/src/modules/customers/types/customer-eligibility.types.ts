import { BookingStatus } from '@prisma/client';

export type EligibilityStageKey =
  | 'CREATE_BOOKING'
  | 'CONFIRM_BOOKING'
  | 'START_PICKUP';

export type EligibilityStageStatus =
  | 'CLEARED'
  | 'ACTION_REQUIRED'
  | 'BLOCKED'
  | 'NOT_APPLICABLE';

export type EligibilityStageResult = {
  key: EligibilityStageKey;
  label: string;
  canProceed: boolean;
  status: EligibilityStageStatus;
  blockingReasons: string[];
  warnings: string[];
  requiredActions: string[];
};

export type CustomerEligibilityResult = {
  customerId: string;
  canCreatePendingBooking: boolean;
  canConfirmBooking: boolean;
  canStartRental: boolean;
  globalBlockingReasons: string[];
  /** Backward-compatible alias — global blockers only (not pickup-only). */
  blockingReasons: string[];
  warnings: string[];
  requiredActions: string[];
  stages: {
    createBooking: EligibilityStageResult;
    confirmBooking: EligibilityStageResult;
    startPickup: EligibilityStageResult;
  };
};

export type CustomerEligibilityEvaluateOptions = {
  requestedStatus?: BookingStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  bookingId?: string | null;
};

export type EligibilityBuckets = {
  globalBlockingReasons: string[];
  confirmBlockingReasons: string[];
  pickupBlockingReasons: string[];
  warnings: string[];
  requiredActions: string[];
};

export function createEligibilityBuckets(): EligibilityBuckets {
  return {
    globalBlockingReasons: [],
    confirmBlockingReasons: [],
    pickupBlockingReasons: [],
    warnings: [],
    requiredActions: [],
  };
}

export function pushUniqueReason(target: string[], reason: string): void {
  if (!target.includes(reason)) {
    target.push(reason);
  }
}

const STAGE_LABELS: Record<EligibilityStageKey, string> = {
  CREATE_BOOKING: 'Buchung erstellen',
  CONFIRM_BOOKING: 'Buchung bestätigen',
  START_PICKUP: 'Pickup / Übergabe',
};

export function buildEligibilityStage(
  key: EligibilityStageKey,
  buckets: EligibilityBuckets,
  scope: 'create' | 'confirm' | 'pickup',
): EligibilityStageResult {
  const blockingReasons =
    scope === 'create'
      ? [...buckets.globalBlockingReasons]
      : scope === 'confirm'
        ? [
            ...buckets.globalBlockingReasons,
            ...buckets.confirmBlockingReasons,
          ]
        : [
            ...buckets.globalBlockingReasons,
            ...buckets.confirmBlockingReasons,
            ...buckets.pickupBlockingReasons,
          ];

  const canProceed = blockingReasons.length === 0;
  const status: EligibilityStageStatus = canProceed
    ? buckets.warnings.length > 0 || buckets.requiredActions.length > 0
      ? 'ACTION_REQUIRED'
      : 'CLEARED'
    : 'BLOCKED';

  return {
    key,
    label: STAGE_LABELS[key],
    canProceed,
    status,
    blockingReasons,
    warnings: [...buckets.warnings],
    requiredActions: [...buckets.requiredActions],
  };
}

export function assembleCustomerEligibilityResult(
  customerId: string,
  buckets: EligibilityBuckets,
  flags: {
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
  },
): CustomerEligibilityResult {
  return {
    customerId,
    canCreatePendingBooking: flags.canCreatePendingBooking,
    canConfirmBooking: flags.canConfirmBooking,
    canStartRental: flags.canStartRental,
    globalBlockingReasons: [...buckets.globalBlockingReasons],
    blockingReasons: [...buckets.globalBlockingReasons],
    warnings: [...buckets.warnings],
    requiredActions: [...buckets.requiredActions],
    stages: {
      createBooking: buildEligibilityStage(
        'CREATE_BOOKING',
        buckets,
        'create',
      ),
      confirmBooking: buildEligibilityStage(
        'CONFIRM_BOOKING',
        buckets,
        'confirm',
      ),
      startPickup: buildEligibilityStage('START_PICKUP', buckets, 'pickup'),
    },
  };
}

export class CustomerBookingBlockedException extends Error {
  readonly code = 'CUSTOMER_BOOKING_BLOCKED';
  readonly customerId: string;
  readonly blockingReasons: string[];
  readonly warnings: string[];
  readonly requiredActions: string[];

  constructor(
    message: string,
    customerId: string,
    blockingReasons: string[],
    warnings: string[] = [],
    requiredActions: string[] = [],
  ) {
    super(message);
    this.customerId = customerId;
    this.blockingReasons = blockingReasons;
    this.warnings = warnings;
    this.requiredActions = requiredActions;
  }
}
