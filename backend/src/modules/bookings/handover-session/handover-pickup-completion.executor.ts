import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DamageSource,
  HandoverKind,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import { persistHandoverTechnicalObservationsInTransaction } from '@modules/technical-observations/handover-technical-observation.persistence';
import type { PickupGateEvaluation } from '../booking-pickup-gate/booking-pickup-gate.types';
import {
  PICKUP_GATE_EVENT_TYPE,
  PICKUP_GATE_OUTCOME,
} from '../booking-pickup-gate/booking-pickup-gate.constants';
import type { BookingPickupGateAuditService } from '../booking-pickup-gate/booking-pickup-gate-audit.service';
import { createHandoverCompletionRecordInTransaction } from './handover-completion-record.service';
import { hashHandoverSignableContent, buildHandoverCompletionCanonicalPayload } from './handover-completion-payload.canonical';
import { recordSignatureBindingAuditEvents } from './handover-signature-binding.complete';
import type { HandoverSignatureBindingRecord } from './handover-signature-binding.types';
import { currentHandoverProtocolWhere } from './handover-protocol.query';
import type {
  CreateHandoverProtocolPayload,
  HandoverProtocolDto,
  HandoverTechnicalObservationDraft,
} from '../handover.types';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';

export interface PickupHandoverBookingRow {
  id: string;
  organizationId: string;
  vehicleId: string;
  customerId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  pickupStationId: string | null;
  returnStationId: string | null;
}

export interface ExecutePickupHandoverCompletionInput {
  orgId: string;
  booking: PickupHandoverBookingRow;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  performedAt: Date | null;
  gateEvaluation: PickupGateEvaluation | null;
  sessionId?: string | null;
  sessionVersion?: number | null;
  pickupGateAudit: BookingPickupGateAuditService;
  signatureBindings?: HandoverSignatureBindingRecord[];
}

export interface ExecutePickupHandoverCompletionResult {
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
  createdTechnicalObservationIds: string[];
}

export function normalizeTechnicalObservationDrafts(
  drafts: HandoverTechnicalObservationDraft[] | undefined,
): HandoverTechnicalObservationDraft[] {
  if (!Array.isArray(drafts)) return [];
  const seen = new Set<string>();
  const normalized: HandoverTechnicalObservationDraft[] = [];
  for (const raw of drafts) {
    if (!raw || typeof raw !== 'object') continue;
    const description =
      typeof raw.description === 'string' ? raw.description.trim() : '';
    if (description.length < 3) continue;
    const dedupeKey = description.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push({
      description,
      category: raw.category,
      affectedArea: raw.affectedArea,
      severity: raw.severity,
      blocksRental: raw.blocksRental === true,
    });
  }
  return normalized;
}

export function validatePickupHandoverPayload(p: CreateHandoverProtocolPayload): void {
  if (p == null || typeof p !== 'object') {
    throw new BadRequestException('Payload required');
  }
  if (
    typeof p.odometerKm !== 'number' ||
    !Number.isFinite(p.odometerKm) ||
    p.odometerKm < 0
  ) {
    throw new BadRequestException('odometerKm must be a non-negative number');
  }
  if (
    typeof p.fuelPercent !== 'number' ||
    !Number.isFinite(p.fuelPercent) ||
    p.fuelPercent < 0 ||
    p.fuelPercent > 100
  ) {
    throw new BadRequestException('fuelPercent must be between 0 and 100');
  }
}

export function resolvePickupPerformedAt(
  payload: CreateHandoverProtocolPayload,
  scheduledStartDate: Date,
): Date | null {
  if (payload.performedAt == null || payload.performedAt === '') return null;

  const parsed = new Date(payload.performedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('performedAt must be a valid ISO-8601 timestamp');
  }

  const now = Date.now();
  if (parsed.getTime() > now + 60_000) {
    throw new BadRequestException('performedAt must not be in the future');
  }

  const earliestAllowed = scheduledStartDate.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (parsed.getTime() < earliestAllowed) {
    throw new BadRequestException(
      'performedAt must not be more than 7 days before scheduled pickup',
    );
  }

  return parsed;
}

export function mapHandoverProtocolRow(row: ExecutePickupHandoverCompletionResult['protocol']): HandoverProtocolDto {
  const damageIds = Array.isArray(row.damageIds)
    ? (row.damageIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: row.id,
    bookingId: row.bookingId,
    vehicleId: row.vehicleId,
    kind: row.kind,
    performedAt: row.performedAt.toISOString(),
    performedByUserId: row.performedByUserId,
    performedByName: row.performedByName,
    odometerKm: row.odometerKm,
    fuelPercent: row.fuelPercent,
    fuelFull: row.fuelFull,
    exteriorClean: row.exteriorClean,
    interiorClean: row.interiorClean,
    tiresSeasonOk: row.tiresSeasonOk,
    warningLightsOn: row.warningLightsOn,
    warningLightsNotes: row.warningLightsNotes,
    notes: row.notes,
    customerSignatureName: row.customerSignatureName,
    customerSignatureDataUrl: row.customerSignatureDataUrl,
    staffSignatureName: row.staffSignatureName,
    staffSignatureDataUrl: row.staffSignatureDataUrl,
    documentsAcknowledged: row.documentsAcknowledged,
    damageIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function executePickupHandoverCompletionInTransaction(
  tx: Prisma.TransactionClient,
  input: ExecutePickupHandoverCompletionInput,
): Promise<ExecutePickupHandoverCompletionResult> {
  const { orgId, booking, payload, actor, performedAt, gateEvaluation, sessionId, sessionVersion } =
    input;
  const bookingId = booking.id;

  await tx.$executeRaw`
    SELECT id FROM bookings
    WHERE id = ${bookingId}::uuid AND organization_id = ${orgId}::uuid
    FOR UPDATE
  `;

  const lockedBooking = await tx.booking.findFirst({
    where: { id: bookingId, organizationId: orgId },
    select: { id: true, status: true, vehicleId: true },
  });
  if (!lockedBooking || lockedBooking.status !== 'CONFIRMED') {
    throw new ConflictException({
      code: 'COMPLETE_PICKUP_HANDOVER_BOOKING_WRONG_STATUS',
      message: `Pickup requires CONFIRMED booking, got ${lockedBooking?.status ?? 'missing'}`,
      currentStatus: lockedBooking?.status ?? null,
    });
  }

  const existingPickup = await tx.bookingHandoverProtocol.findFirst({
    where: currentHandoverProtocolWhere(bookingId, 'PICKUP'),
  });
  if (existingPickup) {
    throw new ConflictException({
      code: 'COMPLETE_PICKUP_HANDOVER_PROTOCOL_ALREADY_EXISTS',
      existingProtocolId: existingPickup.id,
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
      kind: 'PICKUP',
      ...(performedAt ? { performedAt } : {}),
      performedByUserId: actor.userId,
      performedByName: actor.displayName,
      odometerKm: Math.max(0, Math.round(payload.odometerKm)),
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
    payload.actualStationId ?? booking.pickupStationId ?? null;

  const updatedBooking = await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: 'ACTIVE',
      ...(actualStationId
        ? { actualPickupStation: { connect: { id: actualStationId } } }
        : {}),
    },
    select: { id: true, status: true, vehicleId: true },
  });

  const vehicleRow = await tx.vehicle.findFirst({
    where: { id: booking.vehicleId, organizationId: orgId },
    select: { status: true },
  });
  const blockedStatus =
    vehicleRow?.status === VehicleStatus.IN_SERVICE ||
    vehicleRow?.status === VehicleStatus.OUT_OF_SERVICE;

  if (blockedStatus) {
    throw new ConflictException({
      code: 'COMPLETE_PICKUP_HANDOVER_VEHICLE_BLOCKED',
      message: 'Vehicle is IN_SERVICE or OUT_OF_SERVICE',
      vehicleStatus: vehicleRow?.status ?? null,
    });
  }

  await tx.vehicle.update({
    where: { id: booking.vehicleId },
    data: {
      status: VehicleStatus.RENTED,
      ...(actualStationId
        ? {
            currentStationId: actualStationId,
            currentStationSource: 'HANDOVER_PICKUP',
            currentStationConfirmedAt: new Date(),
          }
        : {}),
    },
  });

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
        source: DamageSource.PICKUP_HANDOVER,
      },
    });
  }

  const observationDrafts = normalizeTechnicalObservationDrafts(
    payload.technicalObservations,
  );
  const observationPersist = await persistHandoverTechnicalObservationsInTransaction(tx, {
    organizationId: orgId,
    vehicleId: booking.vehicleId,
    bookingId,
    customerId: booking.customerId,
    handoverProtocolId: protocol.id,
    stationId: actualStationId,
    createdByUserId: actor.userId,
    source: 'OPERATOR_HANDOVER',
    drafts: observationDrafts,
  });

  if (gateEvaluation?.overrideUsed) {
    await input.pickupGateAudit.appendInTransaction(tx, {
      organizationId: orgId,
      bookingId,
      eventType: PICKUP_GATE_EVENT_TYPE.OVERRIDE,
      outcome: PICKUP_GATE_OUTCOME.ALLOWED,
      actor,
      overrideReason: payload.pickupGateOverrideReason,
      missingRequirements: gateEvaluation.requirements,
      correlationId: `pickup:${bookingId}`,
    });
  }

  if (sessionId) {
    const sessionUpdate = await tx.bookingHandoverSession.updateMany({
      where: {
        id: sessionId,
        organizationId: orgId,
        bookingId,
        kind: 'PICKUP',
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
        code: 'COMPLETE_PICKUP_HANDOVER_VERSION_CONFLICT',
        message: 'Handover session version conflict',
      });
    }
  }

  const completionRecord = await createHandoverCompletionRecordInTransaction(tx, {
    orgId,
    bookingId,
    vehicleId: booking.vehicleId,
    customerId: booking.customerId,
    stationId: actualStationId,
    protocolId: protocol.id,
    kind: 'PICKUP',
    protocolVersion: 1,
    documentVersion: 1,
    performedAt: protocol.performedAt,
    payload,
    actor,
    signatureBindings: input.signatureBindings,
  });

  if (input.signatureBindings?.length) {
    const canonical = buildHandoverCompletionCanonicalPayload(payload, {
      organizationId: orgId,
      bookingId,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      stationId: actualStationId,
      kind: 'PICKUP',
      documentVersion: 1,
      protocolVersion: 1,
      performedAt: protocol.performedAt.toISOString(),
    });
    canonical.signatureBindings = input.signatureBindings;
    await recordSignatureBindingAuditEvents(tx, {
      organizationId: orgId,
      bookingId,
      kind: 'PICKUP',
      completionRecordId: completionRecord.id,
      bindings: input.signatureBindings,
      signableContentHash: hashHandoverSignableContent(canonical),
      actor,
    });
  }

  return {
    protocol,
    booking: updatedBooking,
    createdTechnicalObservationIds: observationPersist.createdIds,
  };
}
