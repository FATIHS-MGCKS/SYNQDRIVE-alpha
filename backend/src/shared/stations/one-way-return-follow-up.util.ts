import {
  ONE_WAY_RETURN_FOLLOW_UP_VERSION,
  OneWayReturnFollowUpEvaluationInput,
  OneWayReturnFollowUpReason,
  OneWayReturnFollowUpReasonCode,
  OneWayReturnFollowUpRecommendation,
  OneWayReturnFollowUpResult,
  OneWayReturnFollowUpTransferSuggestion,
} from './one-way-return-follow-up.contract';

function reason(
  code: OneWayReturnFollowUpReason['code'],
  message: string,
): OneWayReturnFollowUpReason {
  return { code, message };
}

function buildResult(
  input: OneWayReturnFollowUpEvaluationInput,
  recommendation: OneWayReturnFollowUpResult['recommendation'],
  options: {
    reasons: OneWayReturnFollowUpReason[];
    checks: OneWayReturnFollowUpResult['checks'];
    transferSuggestion?: OneWayReturnFollowUpTransferSuggestion | null;
  },
): OneWayReturnFollowUpResult {
  return {
    version: ONE_WAY_RETURN_FOLLOW_UP_VERSION,
    evaluatedAt: input.evaluatedAt,
    bookingId: input.bookingId,
    recommendation,
    checks: options.checks,
    context: {
      homeStationId: input.homeStationId,
      currentStationId: input.currentStationId,
      actualReturnStationId: input.actualReturnStationId,
      plannedReturnStationId: input.plannedReturnStationId,
      pickupStationId: input.pickupStationId,
      nextBooking: input.nextBooking,
      activeTransfer: input.activeTransfer,
      expectedStationId: input.expectedStationId,
      expectedStationSource: input.expectedStationSource,
    },
    transferSuggestion: options.transferSuggestion ?? null,
    reasons: options.reasons,
    noAutomaticTransfer: true,
    homeUnchanged: true,
    expectedUnchanged: true,
  };
}

function baseChecks(
  input: OneWayReturnFollowUpEvaluationInput,
): OneWayReturnFollowUpResult['checks'] {
  const vehicleHomeDiffersFromReturn =
    !!input.homeStationId && input.homeStationId !== input.actualReturnStationId;
  const currentMatchesReturnStation =
    input.currentStationId === input.actualReturnStationId;
  const nextPickupStationId = input.nextBooking?.pickupStationId ?? null;
  const hasNextBookingAtOtherStation =
    !!nextPickupStationId && nextPickupStationId !== input.currentStationId;

  return {
    isOneWayRental: input.isOneWayRental,
    vehicleHomeDiffersFromReturn,
    currentMatchesReturnStation,
    repositioningRequired: vehicleHomeDiffersFromReturn,
    hasNextBookingAtOtherStation,
    transferSuggestionSensible: false,
  };
}

export function evaluateOneWayReturnFollowUp(
  input: OneWayReturnFollowUpEvaluationInput,
): OneWayReturnFollowUpResult {
  const checks = baseChecks(input);

  if (!input.isOneWayRental) {
    return buildResult(input, OneWayReturnFollowUpRecommendation.NO_ACTION, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.NOT_ONE_WAY,
          'Round-trip booking — no one-way follow-up required.',
        ),
      ],
      checks,
    });
  }

  if (!input.homeStationId) {
    return buildResult(input, OneWayReturnFollowUpRecommendation.MANUAL_REVIEW, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.HOME_STATION_MISSING,
          'One-way follow-up requires an organizational home station on the vehicle.',
        ),
      ],
      checks,
    });
  }

  if (!checks.currentMatchesReturnStation) {
    return buildResult(input, OneWayReturnFollowUpRecommendation.MANUAL_REVIEW, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.CURRENT_MISMATCH,
          'Confirmed current station does not match the actual return station after handover.',
        ),
      ],
      checks,
    });
  }

  if (input.activeTransfer) {
    return buildResult(input, OneWayReturnFollowUpRecommendation.MANUAL_REVIEW, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.ACTIVE_TRANSFER_EXISTS,
          'An active vehicle station transfer already exists — review before planning another move.',
        ),
      ],
      checks,
    });
  }

  if (
    input.expectedStationId &&
    input.expectedStationId !== input.currentStationId
  ) {
    return buildResult(input, OneWayReturnFollowUpRecommendation.MANUAL_REVIEW, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.STALE_EXPECTED_POSITION,
          'Vehicle still has an expected station that differs from the confirmed return position.',
        ),
      ],
      checks,
    });
  }

  const nextPickupStationId = input.nextBooking?.pickupStationId ?? null;

  if (nextPickupStationId && nextPickupStationId === input.currentStationId) {
    const reasons = [
      reason(
        OneWayReturnFollowUpReasonCode.NEXT_BOOKING_AT_RETURN,
        'Next booking pickup is at the current return station — keep vehicle on site.',
      ),
    ];
    if (!checks.repositioningRequired) {
      return buildResult(input, OneWayReturnFollowUpRecommendation.NO_ACTION, {
        reasons,
        checks: { ...checks, transferSuggestionSensible: false },
      });
    }
    return buildResult(input, OneWayReturnFollowUpRecommendation.KEEP_AT_RETURN_STATION, {
      reasons,
      checks: { ...checks, transferSuggestionSensible: false },
    });
  }

  if (nextPickupStationId && nextPickupStationId !== input.currentStationId) {
    if (input.homeStationId && nextPickupStationId === input.homeStationId) {
      const transferSuggestion: OneWayReturnFollowUpTransferSuggestion = {
        kind: 'HOME',
        fromStationId: input.currentStationId,
        toStationId: input.homeStationId,
        sourceBookingId: input.nextBooking?.id,
      };
      return buildResult(input, OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME, {
        reasons: [
          reason(
            OneWayReturnFollowUpReasonCode.NEXT_BOOKING_AT_HOME,
            'Next booking pickup is at the vehicle home station — suggest transfer home.',
          ),
          reason(
            OneWayReturnFollowUpReasonCode.REPOSITIONING_REQUIRED,
            'Vehicle home station differs from the confirmed return station.',
          ),
        ],
        checks: { ...checks, transferSuggestionSensible: true },
        transferSuggestion,
      });
    }

    const transferSuggestion: OneWayReturnFollowUpTransferSuggestion = {
      kind: 'NEXT_BOOKING',
      fromStationId: input.currentStationId,
      toStationId: nextPickupStationId,
      sourceBookingId: input.nextBooking?.id,
    };
    return buildResult(
      input,
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_TO_NEXT_BOOKING,
      {
        reasons: [
          reason(
            OneWayReturnFollowUpReasonCode.NEXT_BOOKING_AT_OTHER_STATION,
            'Next booking pickup is at a different station — suggest transfer to next booking station.',
          ),
        ],
        checks: { ...checks, transferSuggestionSensible: true },
        transferSuggestion,
      },
    );
  }

  if (checks.repositioningRequired) {
    const transferSuggestion: OneWayReturnFollowUpTransferSuggestion = {
      kind: 'HOME',
      fromStationId: input.currentStationId,
      toStationId: input.homeStationId!,
    };
    return buildResult(input, OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME, {
      reasons: [
        reason(
          OneWayReturnFollowUpReasonCode.REPOSITIONING_REQUIRED,
          'Vehicle home station differs from the confirmed return station.',
        ),
      ],
      checks: { ...checks, transferSuggestionSensible: true },
      transferSuggestion,
    });
  }

  return buildResult(input, OneWayReturnFollowUpRecommendation.NO_ACTION, {
    reasons: [
      reason(
        OneWayReturnFollowUpReasonCode.ALIGNED_AT_HOME,
        'Vehicle is at its home station after one-way return — no follow-up action required.',
      ),
    ],
    checks,
  });
}

export function serializeOneWayReturnFollowUpSnapshot(
  result: OneWayReturnFollowUpResult,
): OneWayReturnFollowUpResult {
  return result;
}
