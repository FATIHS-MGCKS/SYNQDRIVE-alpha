import type { BookingStatus } from '@prisma/client';
import {
  OVERDUE_RETURN_EXTENSION_STATUS,
  OVERDUE_RETURN_HANDOVER_STATUS,
  OVERDUE_RETURN_RETURN_STATUS,
} from '@modules/bookings/overdue-return/overdue-return-explanation.constants';
import {
  VEHICLE_BOOKING_CONTEXT_BUCKET,
  VEHICLE_BOOKING_CONTEXT_KIND,
  VEHICLE_BOOKING_CONTEXT_REASON_CODE,
  VEHICLE_BOOKING_DEADLINE_KIND,
  VEHICLE_BOOKING_INCONSISTENCY_FLAG,
  VEHICLE_BOOKING_PROCESS_STEP,
} from './vehicle-booking-context.constants';
import type {
  VehicleBookingContextReasonCode,
  VehicleBookingContextKind,
  VehicleBookingDeadlineKind,
  VehicleBookingInconsistencyFlag,
  VehicleBookingProcessStep,
} from './vehicle-booking-context.constants';
import type {
  BuildVehicleBookingOperationalContextInput,
  VehicleBookingContextRow,
  VehicleBookingContextSnapshot,
  VehicleBookingOperationalContext,
} from './vehicle-booking-context.types';

function formatBookingNumber(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

function resolveExtension(
  endDate: Date,
  originalScheduledReturnAt: Date | null | undefined,
): { extensionStatus: typeof OVERDUE_RETURN_EXTENSION_STATUS[keyof typeof OVERDUE_RETURN_EXTENSION_STATUS]; approvedExtensionUntil: string | null } {
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

function resolveHandoverStatus(
  pickup: { performedAt: Date } | null | undefined,
  ret: { performedAt: Date } | null | undefined,
): typeof OVERDUE_RETURN_HANDOVER_STATUS[keyof typeof OVERDUE_RETURN_HANDOVER_STATUS] {
  if (ret) return OVERDUE_RETURN_HANDOVER_STATUS.RETURN_COMPLETED;
  if (pickup) return OVERDUE_RETURN_HANDOVER_STATUS.PICKUP_COMPLETED;
  return OVERDUE_RETURN_HANDOVER_STATUS.NOT_STARTED;
}

function resolveReturnStatus(
  bookingStatus: BookingStatus,
  ret: { performedAt: Date } | null | undefined,
): typeof OVERDUE_RETURN_RETURN_STATUS[keyof typeof OVERDUE_RETURN_RETURN_STATUS] {
  if (ret) return OVERDUE_RETURN_RETURN_STATUS.COMPLETED;
  if (bookingStatus === 'ACTIVE') return OVERDUE_RETURN_RETURN_STATUS.PENDING;
  return OVERDUE_RETURN_RETURN_STATUS.NOT_APPLICABLE;
}

function resolvePickupOverdue(
  row: VehicleBookingContextRow,
  pickup: { performedAt: Date } | null | undefined,
  now: Date,
): boolean {
  if (pickup) return false;
  if (row.status === 'CONFIRMED' && row.startDate.getTime() < now.getTime()) {
    return true;
  }
  return false;
}

function resolveReturnOverdue(
  row: VehicleBookingContextRow,
  ret: { performedAt: Date } | null | undefined,
  now: Date,
  fleetActiveIsOverdue: boolean,
): boolean {
  if (ret) return false;
  if (row.status === 'ACTIVE' && row.endDate.getTime() < now.getTime()) {
    return true;
  }
  return fleetActiveIsOverdue;
}

function buildSnapshot(
  row: VehicleBookingContextRow,
  bucket: VehicleBookingContextSnapshot['bucket'],
  pickup: { performedAt: Date } | null | undefined,
  ret: { performedAt: Date } | null | undefined,
  stationMap: ReadonlyMap<string, string>,
  now: Date,
  fleetActiveIsOverdue: boolean,
  includeCustomerDisplayName: boolean,
  fmtCustomer: (c: VehicleBookingContextRow['customer']) => string,
): VehicleBookingContextSnapshot {
  const extension = resolveExtension(row.endDate, row.originalScheduledReturnAt);
  const pickupStationName = row.pickupStationId
    ? stationMap.get(row.pickupStationId) ?? null
    : null;
  const plannedReturnName = row.returnStationId
    ? stationMap.get(row.returnStationId) ?? null
    : null;
  const actualReturnName = row.actualReturnStationId
    ? stationMap.get(row.actualReturnStationId) ?? null
    : null;

  return {
    bucket,
    bookingId: row.id,
    bookingNumber: formatBookingNumber(row.id),
    bookingStatus: row.status,
    scheduledPickupAt: row.startDate.toISOString(),
    scheduledReturnAt: row.endDate.toISOString(),
    actualPickupAt: toIso(pickup?.performedAt ?? null),
    actualReturnAt: toIso(ret?.performedAt ?? null),
    pickupStation: {
      stationId: row.actualPickupStationId ?? row.pickupStationId,
      stationName: pickupStationName,
    },
    returnStation: {
      stationId: row.actualReturnStationId ?? row.returnStationId,
      stationName: actualReturnName ?? plannedReturnName,
    },
    extensionStatus: extension.extensionStatus,
    approvedExtensionUntil: extension.approvedExtensionUntil,
    handoverStatus: resolveHandoverStatus(pickup, ret),
    returnStatus: resolveReturnStatus(row.status, ret),
    pickupOverdue: resolvePickupOverdue(row, pickup, now),
    returnOverdue: resolveReturnOverdue(row, ret, now, fleetActiveIsOverdue),
    ...(includeCustomerDisplayName
      ? { customerDisplayName: fmtCustomer(row.customer) }
      : {}),
  };
}

function findRowById(
  rows: readonly VehicleBookingContextRow[],
  bookingId: string | null | undefined,
): VehicleBookingContextRow | null {
  if (!bookingId) return null;
  return rows.find((r) => r.id === bookingId) ?? null;
}

export function buildVehicleBookingOperationalContext(
  input: BuildVehicleBookingOperationalContextInput,
): VehicleBookingOperationalContext {
  const {
    vehicleId,
    vehicleStatus,
    operationalState,
    runtimeState,
    rows,
    pickupProtocolByBookingId,
    returnProtocolByBookingId,
    fleetFlat,
    supplement,
    stationMap,
    fmtCustomer,
    now,
    includeCustomerDisplayName,
    fleetContextLoadFailed,
  } = input;

  const reasonCodes: VehicleBookingContextReasonCode[] = [];
  const inconsistencyFlags: VehicleBookingInconsistencyFlag[] = [];
  const openProcessSteps: VehicleBookingProcessStep[] = [];

  const activeRows = rows.filter((r) => r.status === 'ACTIVE');
  if (activeRows.length > 1) {
    inconsistencyFlags.push(VEHICLE_BOOKING_INCONSISTENCY_FLAG.MULTIPLE_ACTIVE_BOOKINGS);
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.MULTIPLE_ACTIVE_BOOKINGS);
  }

  if (fleetContextLoadFailed) {
    inconsistencyFlags.push(VEHICLE_BOOKING_INCONSISTENCY_FLAG.FLEET_CONTEXT_LOAD_FAILED);
  }

  const currentRow =
    activeRows.length === 1
      ? activeRows[0]
      : fleetFlat.activeBookingId
        ? findRowById(rows, fleetFlat.activeBookingId)
        : activeRows[0] ?? null;

  const reservedRow = fleetFlat.reservedBookingId
    ? findRowById(rows, fleetFlat.reservedBookingId)
    : null;

  const upcomingRow = supplement.nextBookingId
    ? findRowById(rows, supplement.nextBookingId)
    : null;

  let currentBooking: VehicleBookingContextSnapshot | null = null;
  let reservedBooking: VehicleBookingContextSnapshot | null = null;
  let upcomingBooking: VehicleBookingContextSnapshot | null = null;

  if (currentRow) {
    const pickup = pickupProtocolByBookingId.get(currentRow.id);
    const ret = returnProtocolByBookingId.get(currentRow.id);
    currentBooking = buildSnapshot(
      currentRow,
      VEHICLE_BOOKING_CONTEXT_BUCKET.CURRENT,
      pickup,
      ret,
      stationMap,
      now,
      fleetFlat.activeIsOverdue,
      includeCustomerDisplayName,
      fmtCustomer,
    );
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.ACTIVE_RENTED);

    if (!pickup && currentRow.status === 'ACTIVE') {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.PICKUP_HANDOVER_PENDING);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.PICKUP_HANDOVER_PENDING);
    }
    if (!ret && currentRow.status === 'ACTIVE') {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.RETURN_HANDOVER_PENDING);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.RETURN_HANDOVER_PENDING);
    }
    if (currentBooking.pickupOverdue) {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.PICKUP_OVERDUE);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.PICKUP_OVERDUE);
    }
    if (currentBooking.returnOverdue) {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.RETURN_OVERDUE);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.RETURN_OVERDUE);
    }
    if (ret && currentRow.status === 'ACTIVE') {
      inconsistencyFlags.push(
        VEHICLE_BOOKING_INCONSISTENCY_FLAG.RETURN_COMPLETED_BOOKING_STILL_ACTIVE,
      );
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.RETURN_COMPLETED_BOOKING_STILL_ACTIVE);
    }
    if (ret) {
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.RETURN_COMPLETED);
    }
    if (currentBooking.extensionStatus === OVERDUE_RETURN_EXTENSION_STATUS.APPLIED_VIA_END_DATE_PATCH) {
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.EXTENSION_APPLIED);
    }
  }

  if (reservedRow && reservedRow.id !== currentRow?.id) {
    const pickup = pickupProtocolByBookingId.get(reservedRow.id);
    const ret = returnProtocolByBookingId.get(reservedRow.id);
    reservedBooking = buildSnapshot(
      reservedRow,
      VEHICLE_BOOKING_CONTEXT_BUCKET.RESERVED,
      pickup,
      ret,
      stationMap,
      now,
      fleetFlat.reservedIsOverdue,
      includeCustomerDisplayName,
      fmtCustomer,
    );
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.RESERVED_WINDOW);
    if (reservedBooking.pickupOverdue) {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.PICKUP_OVERDUE);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.PICKUP_OVERDUE);
    }
    if (!pickup) {
      openProcessSteps.push(VEHICLE_BOOKING_PROCESS_STEP.PICKUP_HANDOVER_PENDING);
      reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.PICKUP_HANDOVER_PENDING);
    }
  }

  if (upcomingRow && upcomingRow.id !== currentRow?.id && upcomingRow.id !== reservedRow?.id) {
    const pickup = pickupProtocolByBookingId.get(upcomingRow.id);
    const ret = returnProtocolByBookingId.get(upcomingRow.id);
    upcomingBooking = buildSnapshot(
      upcomingRow,
      VEHICLE_BOOKING_CONTEXT_BUCKET.UPCOMING,
      pickup,
      ret,
      stationMap,
      now,
      false,
      includeCustomerDisplayName,
      fmtCustomer,
    );
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.UPCOMING_BOOKING);
  }

  let contextKind: VehicleBookingContextKind = VEHICLE_BOOKING_CONTEXT_KIND.NONE;
  if (currentBooking) {
    contextKind = VEHICLE_BOOKING_CONTEXT_KIND.ACTIVE_RENTED;
  } else if (reservedBooking) {
    contextKind = VEHICLE_BOOKING_CONTEXT_KIND.RESERVED;
  } else if (upcomingBooking) {
    contextKind = VEHICLE_BOOKING_CONTEXT_KIND.UPCOMING;
  } else {
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.NO_OPEN_BOOKING);
  }

  let nextRelevantDeadline: string | null = null;
  let nextRelevantDeadlineKind: VehicleBookingDeadlineKind | null = null;

  const operative = currentBooking ?? reservedBooking ?? upcomingBooking;
  if (operative) {
    const pickupPending = operative.handoverStatus === OVERDUE_RETURN_HANDOVER_STATUS.NOT_STARTED;
    const returnPending =
      operative.bookingStatus === 'ACTIVE' &&
      operative.returnStatus === OVERDUE_RETURN_RETURN_STATUS.PENDING;

    if (returnPending || operative.returnOverdue) {
      nextRelevantDeadline = operative.scheduledReturnAt;
      nextRelevantDeadlineKind = VEHICLE_BOOKING_DEADLINE_KIND.RETURN;
    } else if (pickupPending || operative.pickupOverdue) {
      nextRelevantDeadline = operative.scheduledPickupAt;
      nextRelevantDeadlineKind = VEHICLE_BOOKING_DEADLINE_KIND.PICKUP;
    } else if (operative.scheduledReturnAt) {
      nextRelevantDeadline = operative.scheduledReturnAt;
      nextRelevantDeadlineKind = VEHICLE_BOOKING_DEADLINE_KIND.RETURN;
    }
  }

  const pickupOverdue = Boolean(
    currentBooking?.pickupOverdue || reservedBooking?.pickupOverdue,
  );
  const returnOverdue = Boolean(currentBooking?.returnOverdue);

  if (
    runtimeState === 'Active Rented' &&
    !currentBooking &&
    (vehicleStatus === 'RENTED' || vehicleStatus === 'RESERVED')
  ) {
    reasonCodes.push(VEHICLE_BOOKING_CONTEXT_REASON_CODE.GHOST_OPERATIONAL_STATE);
  }

  return {
    vehicleId,
    contextKind,
    currentBooking,
    reservedBooking,
    upcomingBooking,
    futureBookingCount: supplement.futureBookingCount,
    runtimeState,
    operationalState,
    openProcessSteps: [...new Set(openProcessSteps)],
    nextRelevantDeadline,
    nextRelevantDeadlineKind,
    pickupOverdue,
    returnOverdue,
    reasonCodes: [...new Set(reasonCodes)],
    inconsistencyFlags: [...new Set(inconsistencyFlags)],
    source: 'bookings.vehicle-booking-context.util:buildVehicleBookingOperationalContext',
    calculatedAt: now.toISOString(),
  };
}
