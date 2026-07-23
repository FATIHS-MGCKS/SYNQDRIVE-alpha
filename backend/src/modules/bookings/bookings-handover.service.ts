import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  BookingStatus,
  DamageSource,
  HandoverKind,
  VehicleStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HandoverProtocolDto,
} from './handover.types';
import type { CreateHandoverCommand } from './handover-command.types';
import { HandoverValidationService } from './handover-validation.service';
import { BookingStatusTransitionService } from './state-machine/booking-status-transition.service';
import { HANDOVER_ERROR_CODES } from './handover-error.codes';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import {
  parseAffectedArea,
  parseCategory,
  parseSeverity,
} from '@modules/technical-observations/technical-observations.mapper';
import type { HandoverTechnicalObservationDraft } from './handover.types';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { BookingPickupGateService } from './booking-pickup-gate/booking-pickup-gate.service';
import { BookingPickupGateAuditService } from './booking-pickup-gate/booking-pickup-gate-audit.service';
import {
  PICKUP_GATE_CODE,
  PICKUP_GATE_EVENT_TYPE,
  PICKUP_GATE_OUTCOME,
} from './booking-pickup-gate/booking-pickup-gate.constants';
import type { HandoverActorContext } from './booking-pickup-gate/booking-pickup-gate.types';
import type { PickupGateEvaluation } from './booking-pickup-gate/booking-pickup-gate.types';

// V4.6.75 — Booking handover (pickup + return) lifecycle + protocol persistence.
// V4.8.47 — Vehicle.status is updated explicitly on handover (Option A):
//   PICKUP  → RENTED when vehicle is AVAILABLE / RESERVED. A vehicle that is
//             IN_SERVICE / OUT_OF_SERVICE is NOT handed out: pickup is rejected
//             with a controlled HANDOVER_PICKUP_VEHICLE_BLOCKED conflict so we
//             never leave a booking ACTIVE while the car stays blocked.
//   RETURN  → AVAILABLE only when no other ACTIVE booking exists and the car is
//             not IN_SERVICE / OUT_OF_SERVICE (maintenance/out-of-service are
//             never overwritten). One-way returns always update currentStationId.
// Fleet read-models still derive rental state from open bookings as a safety net.
@Injectable()
export class BookingsHandoverService {
  private readonly logger = new Logger(BookingsHandoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => BookingDocumentGenerationDispatcherService))
    private readonly bookingDocumentGenerationDispatcher: BookingDocumentGenerationDispatcherService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly taskAutomation: TaskAutomationService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
    private readonly pickupGate: BookingPickupGateService,
    private readonly pickupGateAudit: BookingPickupGateAuditService,
    private readonly handoverValidation: HandoverValidationService,
    private readonly statusTransition: BookingStatusTransitionService,
  ) {}

  private runBackgroundTask(label: string, work: Promise<void>): void {
    void work.catch((err: unknown) => {
      this.logger.error(`${label}: ${sanitizeAutomationError(err)}`);
    });
  }

  async createHandover(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    command: CreateHandoverCommand,
    actor: HandoverActorContext,
    options?: { hasOverridePermission?: boolean },
  ): Promise<{ booking: { id: string; status: string }; protocol: HandoverProtocolDto }> {
    const hasOverridePermission = options?.hasOverridePermission ?? false;

    if (kind === 'PICKUP') {
      const existingPickup = await this.prisma.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId, kind: 'PICKUP' } },
      });
      if (existingPickup) {
        const currentBooking = await this.prisma.booking.findFirst({
          where: { id: bookingId, organizationId: orgId },
          select: { id: true, status: true },
        });
        if (currentBooking?.status === 'ACTIVE') {
          return {
            booking: { id: currentBooking.id, status: currentBooking.status },
            protocol: this.mapProtocol(existingPickup),
          };
        }
        throw new ConflictException({
          message: 'Pickup-Protokoll existiert bereits für diese Buchung.',
          code: HANDOVER_ERROR_CODES.ALREADY_EXISTS,
          existingProtocolId: existingPickup.id,
        });
      }
    }

    if (kind === 'RETURN') {
      const existingReturn = await this.prisma.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId, kind: 'RETURN' } },
      });
      if (existingReturn) {
        const currentBooking = await this.prisma.booking.findFirst({
          where: { id: bookingId, organizationId: orgId },
          select: { id: true, status: true },
        });
        if (currentBooking?.status === 'COMPLETED') {
          return {
            booking: { id: currentBooking.id, status: currentBooking.status },
            protocol: this.mapProtocol(existingReturn),
          };
        }
        throw new ConflictException({
          message: 'Rückgabe-Protokoll existiert bereits für diese Buchung.',
          code: HANDOVER_ERROR_CODES.ALREADY_EXISTS,
          existingProtocolId: existingReturn.id,
        });
      }
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        status: true,
        startDate: true,
        endDate: true,
        pickupStationId: true,
        returnStationId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // `performedAt` only applies to PICKUP; return handover timestamps
    // are written on the submission flow itself.
    const performedAt = this.handoverValidation.resolvePerformedAt(
      command,
      kind,
      booking.startDate,
    );

    this.handoverValidation.assertWarningLightsNotes(command);

    const transitionTo: BookingStatus =
      kind === 'PICKUP' ? 'ACTIVE' : 'COMPLETED';
    const transitionTrigger = kind === 'PICKUP' ? 'pickup_handover' : 'return_handover';
    const plannedTransition = this.statusTransition.planTransition({
      from: booking.status,
      to: transitionTo,
      trigger: transitionTrigger,
    });

    let pickupOdometerKm: number | null = null;
    if (kind === 'RETURN') {
      const pickup = await this.prisma.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId, kind: 'PICKUP' } },
        select: { odometerKm: true },
      });
      pickupOdometerKm = pickup?.odometerKm ?? null;
    }

    await this.handoverValidation.assertTenantScopedReferences(command, {
      organizationId: orgId,
      bookingId,
      kind,
      vehicleId: booking.vehicleId,
      bookingStatus: booking.status,
      scheduledStartDate: booking.startDate,
      pickupOdometerKm,
      hasOverridePermission,
    });
    this.handoverValidation.assertOdometerRules(command, {
      organizationId: orgId,
      bookingId,
      kind,
      vehicleId: booking.vehicleId,
      bookingStatus: booking.status,
      scheduledStartDate: booking.startDate,
      pickupOdometerKm,
      hasOverridePermission,
    });

    let gateEvaluation: PickupGateEvaluation | null = null;
    if (kind === 'PICKUP') {
      gateEvaluation = await this.pickupGate.assertPickupAllowed({
        organizationId: orgId,
        bookingId,
        actor,
        payload: {
          documentsAcknowledged: command.documentsAcknowledged,
          customerSignatureName: command.customerSignatureName,
          customerSignatureDataUrl: command.customerSignatureDataUrl,
        },
        overrideReason: command.pickupGateOverrideReason,
        correlationId: `pickup:${bookingId}`,
        hasOverridePermission,
      });
    }

    const damageIds = command.damageIds ?? [];

    const [protocol, updatedBooking] = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.bookingHandoverProtocol.create({
          data: {
            organizationId: orgId,
            bookingId,
            vehicleId: booking.vehicleId,
            kind,
            // V4.6.81 — honour backdated `performedAt` when supplied;
            // fall back to the DB default (`now()`) otherwise.
            ...(performedAt ? { performedAt } : {}),
            performedByUserId: actor.userId,
            performedByName: actor.displayName,
            odometerKm: Math.max(0, Math.round(command.odometerKm)),
            fuelPercent: Math.max(
              0,
              Math.min(100, Math.round(command.fuelPercent)),
            ),
            fuelFull: !!command.fuelFull,
            exteriorClean: command.exteriorClean ?? true,
            interiorClean: command.interiorClean ?? true,
            tiresSeasonOk: command.tiresSeasonOk ?? true,
            warningLightsOn: command.warningLightsOn ?? false,
            warningLightsNotes: command.warningLightsNotes ?? null,
            notes: command.notes ?? null,
            customerSignatureName: command.customerSignatureName ?? null,
            customerSignatureDataUrl:
              command.customerSignatureDataUrl ?? null,
            staffSignatureName: command.staffSignatureName ?? null,
            staffSignatureDataUrl: command.staffSignatureDataUrl ?? null,
            documentsAcknowledged: command.documentsAcknowledged ?? false,
            damageIds: damageIds as unknown as Prisma.InputJsonValue,
          },
        });

        const statusPatch = this.statusTransition.buildUpdateData(
          transitionTo,
          kind === 'RETURN' ? { completedAt: new Date() } : undefined,
        );
        const bookingUpdateData: Prisma.BookingUpdateInput = {
          status: statusPatch.status,
          ...(statusPatch.completedAt ? { completedAt: statusPatch.completedAt } : {}),
        };
        const actualStationId =
          command.actualStationId ??
          (kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId);
        if (kind === 'PICKUP' && actualStationId) {
          bookingUpdateData.actualPickupStation = { connect: { id: actualStationId } };
        }
        if (kind === 'RETURN') {
          if (actualStationId) {
            bookingUpdateData.actualReturnStation = { connect: { id: actualStationId } };
          }
          // kmDriven = return odometer − pickup odometer (if pickup exists).
          const pickup = await tx.bookingHandoverProtocol.findUnique({
            where: { bookingId_kind: { bookingId, kind: 'PICKUP' } },
            select: { odometerKm: true },
          });
          if (pickup && pickup.odometerKm != null) {
            const km = Math.max(
              0,
              created.odometerKm - pickup.odometerKm,
            );
            bookingUpdateData.kmDriven = km;
          }
        }

        const booking2 = await tx.booking.update({
          where: { id: bookingId },
          data: bookingUpdateData,
          select: { id: true, status: true, vehicleId: true },
        });

        // Keep vehicle.status consistent when the handover finalises or
        // releases the car. Maintenance / out-of-service must not be overwritten.
        const vehicleRow = await tx.vehicle.findFirst({
          where: { id: booking.vehicleId, organizationId: orgId },
          select: { status: true },
        });
        const blockedStatus =
          vehicleRow?.status === VehicleStatus.IN_SERVICE ||
          vehicleRow?.status === VehicleStatus.OUT_OF_SERVICE;

        if (kind === 'RETURN') {
          const otherActive = await tx.booking.count({
            where: {
              organizationId: orgId,
              vehicleId: booking.vehicleId,
              status: 'ACTIVE',
              id: { not: bookingId },
            },
          });
          if (!blockedStatus && otherActive === 0) {
            await tx.vehicle.update({
              where: { id: booking.vehicleId },
              data: {
                status: VehicleStatus.AVAILABLE,
                ...(actualStationId
                  ? {
                      currentStationId: actualStationId,
                      currentStationSource: 'HANDOVER_RETURN',
                      currentStationConfirmedAt: new Date(),
                    }
                  : {}),
              },
            });
          } else if (actualStationId) {
            await tx.vehicle.update({
              where: { id: booking.vehicleId },
              data: {
                currentStationId: actualStationId,
                currentStationSource: 'HANDOVER_RETURN',
                currentStationConfirmedAt: new Date(),
              },
            });
          }
        } else if (kind === 'PICKUP') {
          // A vehicle in maintenance / out-of-service must never be handed out.
          // Fail with a controlled conflict — the surrounding $transaction rolls
          // back the protocol + booking transition, so we never end up with an
          // ACTIVE booking on a blocked car. The operator must release the
          // vehicle status (e.g. back to AVAILABLE) before retrying the pickup.
          if (blockedStatus) {
            throw new ConflictException({
              message:
                'Übergabe nicht möglich: Fahrzeug ist aktuell in Wartung bzw. nicht verfügbar (IN_SERVICE/OUT_OF_SERVICE). Bitte Fahrzeugstatus zuerst freigeben.',
              code: 'HANDOVER_PICKUP_VEHICLE_BLOCKED',
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
        }

        if (damageIds.length > 0) {
          const handoverSource =
            kind === 'PICKUP' ? DamageSource.PICKUP_HANDOVER : DamageSource.RETURN_HANDOVER;
          await tx.vehicleDamage.updateMany({
            where: {
              id: { in: damageIds },
              vehicleId: booking.vehicleId,
            },
            data: {
              bookingId,
              customerId: booking.customerId,
              handoverProtocolId: created.id,
              source: handoverSource,
            },
          });
        }

        const observationDrafts = this.normalizeTechnicalObservationDrafts(
          command.technicalObservations,
        );
        if (observationDrafts.length > 0) {
          const complaintSource =
            kind === 'PICKUP' ? 'OPERATOR_HANDOVER' : 'OPERATOR_RETURN';
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
                source: complaintSource,
                blocksRental: draft.blocksRental ?? false,
                bookingId,
                customerId: booking.customerId,
                handoverProtocolId: created.id,
                stationId: actualStationId ?? null,
              },
            });
          }
        }

        if (kind === 'PICKUP' && gateEvaluation?.overrideUsed) {
          await this.pickupGateAudit.appendInTransaction(tx, {
            organizationId: orgId,
            bookingId,
            eventType: PICKUP_GATE_EVENT_TYPE.OVERRIDE,
            outcome: PICKUP_GATE_OUTCOME.ALLOWED,
            actor,
            overrideReason: command.pickupGateOverrideReason,
            missingRequirements: gateEvaluation.requirements,
            correlationId: `pickup:${bookingId}`,
          });
        }

        if (
          kind === 'RETURN' &&
          command.odometerOverrideReason &&
          pickupOdometerKm != null &&
          command.odometerKm < pickupOdometerKm
        ) {
          await this.pickupGateAudit.appendInTransaction(tx, {
            organizationId: orgId,
            bookingId,
            eventType: PICKUP_GATE_EVENT_TYPE.OVERRIDE,
            outcome: PICKUP_GATE_OUTCOME.ALLOWED,
            actor,
            overrideReason: command.odometerOverrideReason,
            missingRequirements: [
              {
                code: PICKUP_GATE_CODE.OVERRIDE_REASON_REQUIRED,
                message: `Return odometer ${command.odometerKm} below pickup ${pickupOdometerKm}`,
                overridable: true,
              },
            ],
            correlationId: `return-odometer:${bookingId}`,
          });
        }

        return [created, booking2] as const;
      },
    );

    await this.statusTransition.commitTransitionEffects(
      {
        organizationId: orgId,
        bookingId,
        vehicleId: booking.vehicleId,
        from: booking.status,
        to: transitionTo,
        trigger: transitionTrigger,
        actor: {
          userId: actor.userId,
          displayName: actor.displayName,
        },
        correlationId: `${kind.toLowerCase()}:${bookingId}`,
      },
      plannedTransition,
    );

    // After a successful handover, generate the protocol PDF (and, on return,
    // the final invoice + PDF). Fire-and-forget: existing handover behaviour and
    // status transitions above are never affected by document generation.
    if (kind === 'PICKUP') {
      void this.bookingDocumentGenerationDispatcher
        .enqueuePickupProtocol(orgId, bookingId, protocol.id, actor.userId)
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue pickup protocol generation booking=${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      this.runBackgroundTask(
        `taskAutomation.onPickupHandoverCompleted(${bookingId})`,
        this.taskAutomation.onPickupHandoverCompleted({
          id: bookingId,
          organizationId: orgId,
          vehicleId: booking.vehicleId,
          customerId: booking.customerId,
          status: 'ACTIVE',
          startDate: booking.startDate,
          endDate: booking.endDate,
          pickupStationId: booking.pickupStationId,
          returnStationId: booking.returnStationId,
        }),
      );
    } else {
      void this.bookingDocumentGenerationDispatcher
        .enqueueReturnDocuments(orgId, bookingId, protocol.id, actor.userId)
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue return document generation booking=${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });

      const eventBase = {
        organizationId: orgId,
        entityType: 'booking' as const,
        entityId: bookingId,
        payload: {
          bookingId,
          vehicleId: updatedBooking.vehicleId,
          status: updatedBooking.status,
        },
      };
      this.workflowEvents.scheduleEmit({
        ...eventBase,
        type: 'booking.returned',
        idempotencyKey: `booking.returned:${bookingId}`,
      });
      this.runBackgroundTask(
        `taskAutomation.onReturnHandoverCompleted(${bookingId})`,
        this.taskAutomation.onReturnHandoverCompleted({
          id: bookingId,
          organizationId: orgId,
          vehicleId: booking.vehicleId,
          customerId: booking.customerId,
          status: 'COMPLETED',
          startDate: booking.startDate,
          endDate: booking.endDate,
          pickupStationId: booking.pickupStationId,
          returnStationId: booking.returnStationId,
        }),
      );
    }

    await this.fleetMapCache.invalidate(orgId);
    await this.rentalHealthSummaryCache.invalidate(orgId, booking.vehicleId);

    return {
      booking: { id: updatedBooking.id, status: updatedBooking.status },
      protocol: this.mapProtocol(protocol),
    };
  }

  async findForBooking(
    orgId: string,
    bookingId: string,
  ): Promise<HandoverProtocolDto[]> {
    const exists = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Booking not found');

    const rows = await this.prisma.bookingHandoverProtocol.findMany({
      where: { bookingId, organizationId: orgId },
      orderBy: { performedAt: 'asc' },
    });
    return rows.map((r) => this.mapProtocol(r));
  }

  // Batch helper consumed by BookingsService.findAll / findById so the UI can
  // render a booking's protocols without a second roundtrip.
  async findForBookingsMap(
    orgId: string,
    bookingIds: string[],
  ): Promise<Map<string, HandoverProtocolDto[]>> {
    if (bookingIds.length === 0) return new Map();
    const rows = await this.prisma.bookingHandoverProtocol.findMany({
      where: { organizationId: orgId, bookingId: { in: bookingIds } },
      orderBy: { performedAt: 'asc' },
    });
    const map = new Map<string, HandoverProtocolDto[]>();
    for (const r of rows) {
      const dto = this.mapProtocol(r);
      const list = map.get(dto.bookingId) ?? [];
      list.push(dto);
      map.set(dto.bookingId, list);
    }
    return map;
  }

  private normalizeTechnicalObservationDrafts(
    drafts: CreateHandoverCommand['technicalObservations'],
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

  private mapProtocol(r: {
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
  }): HandoverProtocolDto {
    const damageIds = Array.isArray(r.damageIds)
      ? (r.damageIds as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [];
    return {
      id: r.id,
      bookingId: r.bookingId,
      vehicleId: r.vehicleId,
      kind: r.kind,
      performedAt: r.performedAt.toISOString(),
      performedByUserId: r.performedByUserId,
      performedByName: r.performedByName,
      odometerKm: r.odometerKm,
      fuelPercent: r.fuelPercent,
      fuelFull: r.fuelFull,
      exteriorClean: r.exteriorClean,
      interiorClean: r.interiorClean,
      tiresSeasonOk: r.tiresSeasonOk,
      warningLightsOn: r.warningLightsOn,
      warningLightsNotes: r.warningLightsNotes,
      notes: r.notes,
      customerSignatureName: r.customerSignatureName,
      customerSignatureDataUrl: r.customerSignatureDataUrl,
      staffSignatureName: r.staffSignatureName,
      staffSignatureDataUrl: r.staffSignatureDataUrl,
      documentsAcknowledged: r.documentsAcknowledged,
      damageIds,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
