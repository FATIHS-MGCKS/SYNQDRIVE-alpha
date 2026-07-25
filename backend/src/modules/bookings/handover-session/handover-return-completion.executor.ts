import { ConflictException } from '@nestjs/common';
import {
  DamageSource,
  HandoverKind,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import {
  parseAffectedArea,
  parseCategory,
  parseSeverity,
} from '@modules/technical-observations/technical-observations.mapper';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload } from '../handover.types';
import {
  normalizeTechnicalObservationDrafts,
  type PickupHandoverBookingRow,
} from './handover-pickup-completion.executor';
import { createHandoverCompletionRecordInTransaction } from './handover-completion-record.service';
import { currentHandoverProtocolWhere } from './handover-protocol.query';

export interface ExecuteReturnHandoverCompletionInput {
  orgId: string;
  booking: PickupHandoverBookingRow;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  pickupOdometerKm: number;
  sessionId?: string | null;
  sessionVersion?: number | null;
}

export interface ExecuteReturnHandoverCompletionResult {
  protocol: {
    id: string;
    bookingId: string;
    vehicleId: string;
    kind: HandoverKind;
    performedAt: Date;
    performedByUserId: string | null;
    performedByName: string | null;
    odometerKm: number;
    fuelPercent: number;
    fuelFull: boolean;
    exteriorClean: boolean;
    interiorClean: boolean;
    tiresSeasonOk: boolean;
    warningLightsOn: boolean;
    warningLightsNotes: string | null;
    notes: string | null;
    customerSignatureName: string | null;
    customerSignatureDataUrl: string | null;
    staffSignatureName: string | null;
    staffSignatureDataUrl: string | null;
    documentsAcknowledged: boolean;
    damageIds: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  booking: { id: string; status: string; vehicleId: string };
}

/**
 * Central return vehicle availability transition — does not set IN_SERVICE from observations.
 */
export function resolveReturnVehicleUpdate(input: {
  vehicleStatus: VehicleStatus;
  otherActiveBookings: number;
  actualStationId: string | null;
}): {
  status?: VehicleStatus;
  currentStationId?: string;
  currentStationSource?: string;
  currentStationConfirmedAt?: Date;
} {
  const blockedStatus =
    input.vehicleStatus === VehicleStatus.IN_SERVICE ||
    input.vehicleStatus === VehicleStatus.OUT_OF_SERVICE;

  const stationPatch = input.actualStationId
    ? {
        currentStationId: input.actualStationId,
        currentStationSource: 'HANDOVER_RETURN',
        currentStationConfirmedAt: new Date(),
      }
    : {};

  if (!blockedStatus && input.otherActiveBookings === 0) {
    return {
      status: VehicleStatus.AVAILABLE,
      ...stationPatch,
    };
  }

  if (input.actualStationId) {
    return stationPatch;
  }

  return {};
}

export async function executeReturnHandoverCompletionInTransaction(
  tx: Prisma.TransactionClient,
  input: ExecuteReturnHandoverCompletionInput,
): Promise<ExecuteReturnHandoverCompletionResult> {
  const { orgId, booking, payload, actor, pickupOdometerKm, sessionId, sessionVersion } = input;
  const bookingId = booking.id;
  const returnOdometerKm = Math.max(0, Math.round(payload.odometerKm));

  await tx.$executeRaw`
    SELECT id FROM bookings
    WHERE id = ${bookingId}::uuid AND organization_id = ${orgId}::uuid
    FOR UPDATE
  `;

  const lockedBooking = await tx.booking.findFirst({
    where: { id: bookingId, organizationId: orgId },
    select: { id: true, status: true, vehicleId: true },
  });
  if (!lockedBooking || lockedBooking.status !== 'ACTIVE') {
    throw new ConflictException({
      code: 'COMPLETE_RETURN_HANDOVER_BOOKING_WRONG_STATUS',
      message: `Return requires ACTIVE booking, got ${lockedBooking?.status ?? 'missing'}`,
      currentStatus: lockedBooking?.status ?? null,
    });
  }

  const pickupProtocol = await tx.bookingHandoverProtocol.findFirst({
    where: currentHandoverProtocolWhere(bookingId, 'PICKUP'),
    select: { id: true, odometerKm: true },
  });
  if (!pickupProtocol) {
    throw new ConflictException({
      code: 'COMPLETE_RETURN_HANDOVER_PICKUP_PROTOCOL_REQUIRED',
      message: 'Pickup protocol required before return completion',
    });
  }

  const existingReturn = await tx.bookingHandoverProtocol.findFirst({
    where: currentHandoverProtocolWhere(bookingId, 'RETURN'),
    select: { id: true },
  });
  if (existingReturn) {
    throw new ConflictException({
      code: 'COMPLETE_RETURN_HANDOVER_PROTOCOL_ALREADY_EXISTS',
      existingProtocolId: existingReturn.id,
    });
  }

  if (returnOdometerKm < pickupOdometerKm) {
    throw new ConflictException({
      code: 'COMPLETE_RETURN_HANDOVER_ODOMETER_IMPLAUSIBLE',
      message: `Return odometer ${returnOdometerKm} is less than pickup ${pickupOdometerKm}`,
      pickupOdometerKm,
      returnOdometerKm,
    });
  }

  const damageIds = Array.isArray(payload.damageIds)
    ? payload.damageIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];

  const protocol = await tx.bookingHandoverProtocol.create({
    data: {
      organizationId: orgId,
      bookingId,
      vehicleId: booking.vehicleId,
      kind: 'RETURN',
      performedByUserId: actor.userId,
      performedByName: actor.displayName,
      odometerKm: returnOdometerKm,
      fuelPercent: Math.max(0, Math.min(100, Math.round(payload.fuelPercent))),
      fuelFull: !!payload.fuelFull,
      exteriorClean: payload.exteriorClean ?? true,
      interiorClean: payload.interiorClean ?? true,
      tiresSeasonOk: payload.tiresSeasonOk ?? true,
      warningLightsOn: payload.warningLightsOn ?? false,
      warningLightsNotes: payload.warningLightsNotes ?? null,
      notes: payload.notes ?? null,
      customerSignatureName: payload.customerSignatureName ?? null,
      customerSignatureDataUrl: payload.customerSignatureDataUrl ?? null,
      staffSignatureName: payload.staffSignatureName ?? null,
      staffSignatureDataUrl: payload.staffSignatureDataUrl ?? null,
      documentsAcknowledged: payload.documentsAcknowledged ?? false,
      damageIds: damageIds as unknown as Prisma.InputJsonValue,
    },
  });

  const actualStationId =
    payload.actualStationId?.trim() || booking.returnStationId || null;
  const kmDriven = Math.max(0, returnOdometerKm - pickupOdometerKm);

  const updatedBooking = await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      kmDriven,
      ...(actualStationId
        ? { actualReturnStation: { connect: { id: actualStationId } } }
        : {}),
    },
    select: { id: true, status: true, vehicleId: true },
  });

  const vehicleRow = await tx.vehicle.findFirst({
    where: { id: booking.vehicleId, organizationId: orgId },
    select: { status: true },
  });
  if (!vehicleRow) {
    throw new ConflictException({
      code: 'COMPLETE_RETURN_HANDOVER_VEHICLE_MISMATCH',
      message: 'Vehicle not found for booking',
    });
  }

  const otherActive = await tx.booking.count({
    where: {
      organizationId: orgId,
      vehicleId: booking.vehicleId,
      status: 'ACTIVE',
      id: { not: bookingId },
    },
  });

  const vehiclePatch = resolveReturnVehicleUpdate({
    vehicleStatus: vehicleRow.status,
    otherActiveBookings: otherActive,
    actualStationId,
  });
  if (Object.keys(vehiclePatch).length > 0) {
    await tx.vehicle.update({
      where: { id: booking.vehicleId },
      data: vehiclePatch,
    });
  }

  if (damageIds.length > 0) {
    await tx.vehicleDamage.updateMany({
      where: {
        id: { in: damageIds },
        vehicleId: booking.vehicleId,
      },
      data: {
        bookingId,
        customerId: booking.customerId,
        handoverProtocolId: protocol.id,
        source: DamageSource.RETURN_HANDOVER,
      },
    });
  }

  const observationDrafts = normalizeTechnicalObservationDrafts(payload.technicalObservations);
  for (const draft of observationDrafts) {
    await tx.vehicleComplaint.create({
      data: {
        organizationId: orgId,
        vehicleId: booking.vehicleId,
        createdByUserId: actor.userId,
        description: draft.description,
        urgency: parseSeverity(draft.severity),
        category: parseCategory(draft.category),
        affectedArea: parseAffectedArea(draft.affectedArea),
        status: 'ACTIVE',
        source: 'OPERATOR_RETURN',
        blocksRental: draft.blocksRental ?? false,
        bookingId,
        customerId: booking.customerId,
        handoverProtocolId: protocol.id,
        stationId: actualStationId,
      },
    });
  }

  if (sessionId) {
    const sessionUpdate = await tx.bookingHandoverSession.updateMany({
      where: {
        id: sessionId,
        organizationId: orgId,
        bookingId,
        kind: 'RETURN',
        ...(sessionVersion != null ? { version: sessionVersion } : {}),
      },
      data: {
        status: 'COMPLETED',
        version: { increment: 1 },
        completedProtocolId: protocol.id,
        lockedByUserId: null,
        lockedAt: null,
      },
    });
    if (sessionUpdate.count === 0) {
      throw new ConflictException({
        code: 'COMPLETE_RETURN_HANDOVER_VERSION_CONFLICT',
        message: 'Handover session version conflict',
      });
    }
  }

  await createHandoverCompletionRecordInTransaction(tx, {
    orgId,
    bookingId,
    vehicleId: booking.vehicleId,
    customerId: booking.customerId,
    stationId: actualStationId,
    protocolId: protocol.id,
    kind: 'RETURN',
    protocolVersion: 1,
    documentVersion: 1,
    performedAt: protocol.performedAt,
    payload,
    actor,
  });

  return { protocol, booking: updatedBooking };
}
