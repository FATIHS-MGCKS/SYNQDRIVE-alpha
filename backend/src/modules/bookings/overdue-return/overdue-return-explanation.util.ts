import type { BookingStatus } from '@prisma/client';
import {
  BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES,
  OVERDUE_RETURN_EXTENSION_STATUS,
  OVERDUE_RETURN_HANDOVER_STATUS,
  OVERDUE_RETURN_INCONSISTENCY_FLAG,
  OVERDUE_RETURN_REASON_CODE,
  OVERDUE_RETURN_RETURN_STATUS,
  type OverdueReturnReasonCode,
  type OverdueReturnInconsistencyFlag,
} from './overdue-return-explanation.constants';
import type {
  OverdueReturnExplanation,
  OverdueReturnExplanationInput,
} from './overdue-return-explanation.types';
import type {
  OverdueReturnHandoverStatus,
  OverdueReturnReturnStatus,
  OverdueReturnExtensionStatus,
} from './overdue-return-explanation.constants';

function formatBookingNumber(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

function resolveHandoverStatus(
  pickupProtocol: OverdueReturnExplanationInput['pickupProtocol'],
  returnProtocol: OverdueReturnExplanationInput['returnProtocol'],
): OverdueReturnHandoverStatus {
  if (returnProtocol) return OVERDUE_RETURN_HANDOVER_STATUS.RETURN_COMPLETED;
  if (pickupProtocol) return OVERDUE_RETURN_HANDOVER_STATUS.PICKUP_COMPLETED;
  return OVERDUE_RETURN_HANDOVER_STATUS.NOT_STARTED;
}

function resolveReturnStatus(
  bookingStatus: BookingStatus,
  returnProtocol: OverdueReturnExplanationInput['returnProtocol'],
): OverdueReturnReturnStatus {
  if (returnProtocol) return OVERDUE_RETURN_RETURN_STATUS.COMPLETED;
  if (bookingStatus === 'ACTIVE') return OVERDUE_RETURN_RETURN_STATUS.PENDING;
  return OVERDUE_RETURN_RETURN_STATUS.NOT_APPLICABLE;
}

function resolveExtension(
  endDate: Date,
  originalScheduledReturnAt: Date | null | undefined,
): {
  extensionStatus: OverdueReturnExtensionStatus;
  approvedExtensionUntil: string | null;
} {
  if (!originalScheduledReturnAt) {
    return {
      extensionStatus: OVERDUE_RETURN_EXTENSION_STATUS.UNKNOWN,
      approvedExtensionUntil: null,
    };
  }
  if (endDate.getTime() > originalScheduledReturnAt.getTime()) {
    return {
      extensionStatus: OVERDUE_RETURN_EXTENSION_STATUS.APPLIED_VIA_END_DATE_PATCH,
      approvedExtensionUntil: endDate.toISOString(),
    };
  }
  return {
    extensionStatus: OVERDUE_RETURN_EXTENSION_STATUS.NONE,
    approvedExtensionUntil: null,
  };
}

/**
 * Canonical overdue-return explanation — mirrors `buildTodayReturnSignals`,
 * `fleet-booking-context.util`, and `computeBookingReturnTiming` without inventing
 * new business rules.
 */
export function buildOverdueReturnExplanation(
  input: OverdueReturnExplanationInput,
): OverdueReturnExplanation {
  const { booking, pickupProtocol, returnProtocol, orgTimezone: _orgTimezone, now } = input;
  const scheduledReturnAt = booking.endDate;
  const gracePeriodMinutes = BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES;
  const handoverStatus = resolveHandoverStatus(pickupProtocol, returnProtocol);
  const returnStatus = resolveReturnStatus(booking.status, returnProtocol);
  const extension = resolveExtension(scheduledReturnAt, input.originalScheduledReturnAt);

  const reasonCodes: OverdueReturnReasonCode[] = [];
  const blockingFacts: string[] = [];
  const inconsistencyFlags: OverdueReturnInconsistencyFlag[] = [];

  const deadlineMs = scheduledReturnAt.getTime();
  const graceDeadlineMs =
    deadlineMs + gracePeriodMinutes * 60_000;
  const pastDeadline = now.getTime() > deadlineMs;
  const pastGrace = now.getTime() > graceDeadlineMs;

  const todayReturnIsOverdue =
    !returnProtocol && pastDeadline ? true : returnProtocol ? false : null;

  const fleetActiveIsOverdue =
    booking.status === 'ACTIVE' && pastDeadline;

  const isMarkedOverdue = Boolean(
    todayReturnIsOverdue === true ||
      fleetActiveIsOverdue ||
      input.fleetActiveIsOverdue === true ||
      input.runtimeMarkedOverdue === true,
  );

  let overdueSince: string | null = null;
  let overdueDurationMinutes: number | null = null;

  if (isMarkedOverdue && pastGrace) {
    overdueSince = new Date(graceDeadlineMs).toISOString();
    overdueDurationMinutes = Math.max(
      0,
      Math.round((now.getTime() - graceDeadlineMs) / 60_000),
    );
  } else if (isMarkedOverdue && pastDeadline) {
    overdueSince = scheduledReturnAt.toISOString();
    overdueDurationMinutes = Math.max(
      0,
      Math.round((now.getTime() - deadlineMs) / 60_000),
    );
  }

  if (booking.status === 'ACTIVE' && !returnProtocol && pastDeadline) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.RETURN_NOT_COMPLETED);
    blockingFacts.push('return_handover_protocol_missing=true');
  }

  if (pastDeadline) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.RETURN_DEADLINE_PASSED);
    blockingFacts.push(`scheduled_return_at=${scheduledReturnAt.toISOString()}`);
  }

  if (pastGrace && isMarkedOverdue) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.GRACE_PERIOD_EXCEEDED);
    blockingFacts.push(`grace_period_minutes=${gracePeriodMinutes}`);
  }

  if (
    extension.extensionStatus === OVERDUE_RETURN_EXTENSION_STATUS.NONE &&
    isMarkedOverdue &&
    pastDeadline
  ) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.NO_APPROVED_EXTENSION);
  }

  if (booking.status === 'ACTIVE' && pickupProtocol && !returnProtocol) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.HANDOVER_STILL_ACTIVE);
    blockingFacts.push('pickup_protocol_exists=true');
    blockingFacts.push('return_handover_protocol_missing=true');
  }

  if (booking.status !== 'ACTIVE') {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.STATUS_WITHOUT_ACTIVE_BOOKING);
    blockingFacts.push(`booking_status=${booking.status}`);
  }

  if (returnProtocol && booking.status === 'ACTIVE') {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.RETURN_COMPLETED_BOOKING_STILL_ACTIVE,
    );
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.RETURN_COMPLETED_BUT_RUNTIME_STALE);
    blockingFacts.push('return_protocol_exists=true');
    blockingFacts.push(`booking_status=${booking.status}`);
  }

  if (
    (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') &&
    isMarkedOverdue
  ) {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.CANCELLED_BOOKING_MARKED_OVERDUE,
    );
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.BOOKING_CANCELLED_BUT_MARKED_OVERDUE);
    blockingFacts.push(`booking_status=${booking.status}`);
  }

  if (
    returnProtocol &&
    (input.fleetActiveIsOverdue === true || input.runtimeMarkedOverdue === true)
  ) {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.RETURN_PROTOCOL_EXISTS_BUT_MARKED_OVERDUE,
    );
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.RETURN_COMPLETED_BUT_RUNTIME_STALE);
  }

  const fleetFlag = input.fleetActiveIsOverdue;
  if (
    fleetFlag != null &&
    fleetFlag !== fleetActiveIsOverdue &&
    booking.status === 'ACTIVE'
  ) {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.FLEET_ACTIVE_IS_OVERDUE_DIVERGENCE,
    );
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.FLEET_CONTEXT_DIVERGENCE);
  }

  if (
    fleetFlag != null &&
    returnProtocol &&
    fleetFlag !== false
  ) {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.FLEET_ACTIVE_IS_OVERDUE_DIVERGENCE,
    );
  }

  if (booking.status !== 'ACTIVE' && isMarkedOverdue) {
    inconsistencyFlags.push(
      OVERDUE_RETURN_INCONSISTENCY_FLAG.STATUS_WITHOUT_ACTIVE_BOOKING,
    );
  }

  if (!isMarkedOverdue && !pastDeadline) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.RETURN_NOT_DUE_YET);
  }

  if (!isMarkedOverdue && reasonCodes.length === 0) {
    reasonCodes.push(OVERDUE_RETURN_REASON_CODE.NOT_APPLICABLE);
  }

  return {
    vehicleId: booking.vehicleId,
    bookingId: booking.id,
    bookingNumber: formatBookingNumber(booking.id),
    bookingStatus: booking.status,
    scheduledReturnAt: scheduledReturnAt.toISOString(),
    gracePeriodMinutes: gracePeriodMinutes,
    overdueSince,
    overdueDurationMinutes,
    actualReturnAt: toIso(returnProtocol?.performedAt ?? null),
    handoverStatus,
    returnStatus,
    extensionStatus: extension.extensionStatus,
    approvedExtensionUntil: extension.approvedExtensionUntil,
    returnStation: {
      stationId: booking.returnStationId,
      stationName: null,
    },
    isMarkedOverdue,
    reasonCodes: [...new Set(reasonCodes)],
    blockingFacts,
    inconsistencyFlags: [...new Set(inconsistencyFlags)],
    source: 'bookings.overdue-return-explanation.util:buildOverdueReturnExplanation',
    calculatedAt: now.toISOString(),
  };
}
