import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
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
  CreateHandoverProtocolPayload,
  HandoverProtocolDto,
} from './handover.types';
import {
  parseAffectedArea,
  parseCategory,
  parseSeverity,
} from '@modules/technical-observations/technical-observations.mapper';
import type { HandoverTechnicalObservationDraft } from './handover.types';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { BookingPickupGateService } from './booking-pickup-gate/booking-pickup-gate.service';
import { BookingPickupGateAuditService } from './booking-pickup-gate/booking-pickup-gate-audit.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck/booking-eligibility-recheck.service';
import { BookingDomainEventLifecycleService } from './outbox/booking-domain-event-lifecycle.service';
import {
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
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
    private readonly pickupGate: BookingPickupGateService,
    private readonly pickupGateAudit: BookingPickupGateAuditService,
    private readonly bookingEligibilityEnforcement: BookingEligibilityEnforcementService,
    @Inject(forwardRef(() => BookingEligibilityRecheckService))
    private readonly bookingEligibilityRecheck: BookingEligibilityRecheckService,
    private readonly bookingDomainEvents: BookingDomainEventLifecycleService,
  ) {}

  async createHandover(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    payload: CreateHandoverProtocolPayload,
    actor: HandoverActorContext,
  ): Promise<{ booking: { id: string; status: string }; protocol: HandoverProtocolDto }> {
    this.validatePayload(payload);

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
          code: 'HANDOVER_ALREADY_EXISTS',
          existingProtocolId: existingPickup.id,
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

    // V4.6.81 — Backdate support. When the operator records a pickup that
    // actually happened earlier (customer was late, dispatcher logs after
    // the fact), the UI supplies `performedAt`. The DB default (`now()`)
    // is wrong for those cases: a 3-hour-late pickup recorded at 18:00
    // should show 18:00, not the moment the form was saved. We validate
    // that the timestamp is (a) parseable, (b) not in the future (a
    // pickup can never happen later than right now), and (c) not older
    // than 7 days before the scheduled start — a broader backdate window
    // indicates either a typo or an operator editing the wrong booking.
    // `performedAt` only applies to PICKUP; return handover timestamps
    // are written on the submission flow itself.
    const performedAt = this.resolvePerformedAt(payload, kind, booking.startDate);

    const expectedFrom: BookingStatus =
      kind === 'PICKUP' ? 'CONFIRMED' : 'ACTIVE';
    const transitionTo: BookingStatus =
      kind === 'PICKUP' ? 'ACTIVE' : 'COMPLETED';

    if (booking.status !== expectedFrom) {
      throw new ConflictException({
        message:
          kind === 'PICKUP'
            ? `Übergabe nicht möglich: Buchung ist bereits im Status ${booking.status}. Pickup erfordert Status CONFIRMED.`
            : `Rückgabe nicht möglich: Buchung ist im Status ${booking.status}. Return erfordert Status ACTIVE.`,
        code:
          kind === 'PICKUP'
            ? 'HANDOVER_PICKUP_WRONG_STATUS'
            : 'HANDOVER_RETURN_WRONG_STATUS',
        currentStatus: booking.status,
      });
    }

    let gateEvaluation: PickupGateEvaluation | null = null;
    if (kind === 'PICKUP') {
      await this.bookingEligibilityRecheck.processPickupPrecheck(orgId, bookingId, actor.userId);

      await this.bookingEligibilityEnforcement.assertAllowedForPickup(orgId, bookingId, {
        userId: actor.userId,
        membershipRole: actor.membershipRole as never,
        eligibilityApprovalId: payload.eligibilityApprovalId,
      });

      gateEvaluation = await this.pickupGate.assertPickupAllowed({
        organizationId: orgId,
        bookingId,
        actor,
        payload: {
          documentsAcknowledged: payload.documentsAcknowledged,
          customerSignatureName: payload.customerSignatureName,
          customerSignatureDataUrl: payload.customerSignatureDataUrl,
          performedByUserId: (payload as { performedByUserId?: string | null }).performedByUserId,
          performedByName: (payload as { performedByName?: string | null }).performedByName,
        },
        overrideReason: payload.pickupGateOverrideReason,
        correlationId: `pickup:${bookingId}`,
      });
    }

    // Uniqueness defence for RETURN (PICKUP handled above with idempotent replay).
    if (kind === 'RETURN') {
      const existingReturn = await this.prisma.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId, kind: 'RETURN' } },
        select: { id: true },
      });
      if (existingReturn) {
        throw new ConflictException({
          message: 'Rückgabe-Protokoll existiert bereits für diese Buchung.',
          code: 'HANDOVER_ALREADY_EXISTS',
          existingProtocolId: existingReturn.id,
        });
      }
    }

    const damageIds = Array.isArray(payload.damageIds)
      ? payload.damageIds.filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        )
      : [];

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
            odometerKm: Math.max(0, Math.round(payload.odometerKm)),
            fuelPercent: Math.max(
              0,
              Math.min(100, Math.round(payload.fuelPercent)),
            ),
            fuelFull: !!payload.fuelFull,
            exteriorClean: payload.exteriorClean ?? true,
            interiorClean: payload.interiorClean ?? true,
            tiresSeasonOk: payload.tiresSeasonOk ?? true,
            warningLightsOn: payload.warningLightsOn ?? false,
            warningLightsNotes: payload.warningLightsNotes ?? null,
            notes: payload.notes ?? null,
            customerSignatureName: payload.customerSignatureName ?? null,
            customerSignatureDataUrl:
              payload.customerSignatureDataUrl ?? null,
            staffSignatureName: payload.staffSignatureName ?? null,
            staffSignatureDataUrl: payload.staffSignatureDataUrl ?? null,
            documentsAcknowledged: payload.documentsAcknowledged ?? false,
            damageIds: damageIds as unknown as Prisma.InputJsonValue,
          },
        });

        const bookingUpdateData: Prisma.BookingUpdateInput = {
          status: transitionTo,
        };
        const actualStationId =
          payload.actualStationId ??
          (kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId);
        if (kind === 'PICKUP' && actualStationId) {
          bookingUpdateData.actualPickupStation = { connect: { id: actualStationId } };
        }
        if (kind === 'RETURN') {
          bookingUpdateData.completedAt = new Date();
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
          payload.technicalObservations,
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
            overrideReason: payload.pickupGateOverrideReason,
            missingRequirements: gateEvaluation.requirements,
            correlationId: `pickup:${bookingId}`,
          });
        }

        const bookingForEvent = {
          ...booking,
          status: booking2.status,
        };
        if (kind === 'PICKUP') {
          await this.bookingDomainEvents.recordPickupCompleted(
            tx,
            bookingForEvent,
            created.id,
            { actorUserId: actor.userId, causationId: created.id },
          );
        } else {
          await this.bookingDomainEvents.recordReturnCompleted(
            tx,
            bookingForEvent,
            created.id,
            { actorUserId: actor.userId, causationId: created.id },
          );
        }

        return [created, booking2] as const;
      },
    );

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

  // V4.6.81 — Accept an optional backdated `performedAt` for PICKUP so
  // operators can record a handover that physically happened earlier.
  //   • PICKUP without `performedAt` → undefined, Prisma uses the DB
  //     default (`now()`), preserving V4.6.75 behaviour.
  //   • PICKUP with `performedAt` → parsed ISO-8601 date. Rejected if
  //     unparseable, in the future, or more than 7 days before
  //     `booking.startDate` (heuristic: the only legitimate reason to
  //     backdate further is a data-entry error on the wrong booking).
  //   • RETURN — we currently DO NOT expose backdating. Return handover
  //     side-effects (mileage delta, completedAt) are time-sensitive, so
  //     the operator should always re-run the dialog when the return
  //     actually happens. Keeping RETURN simple avoids a second code
  //     path for kmDriven calculations, which already read from pickup.
  private resolvePerformedAt(
    payload: CreateHandoverProtocolPayload,
    kind: HandoverKind,
    scheduledStartDate: Date,
  ): Date | null {
    if (kind !== 'PICKUP') return null;
    if (payload.performedAt == null || payload.performedAt === '') return null;

    const parsed = new Date(payload.performedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'performedAt muss ein gültiger ISO-8601 Zeitstempel sein',
      );
    }

    const now = Date.now();
    if (parsed.getTime() > now + 60_000 /* allow 60s clock skew */) {
      throw new BadRequestException(
        'performedAt darf nicht in der Zukunft liegen',
      );
    }

    const earliestAllowed =
      scheduledStartDate.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() < earliestAllowed) {
      throw new BadRequestException(
        'performedAt darf höchstens 7 Tage vor dem geplanten Pickup liegen',
      );
    }

    return parsed;
  }

  private normalizeTechnicalObservationDrafts(
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

  private validatePayload(p: CreateHandoverProtocolPayload) {
    if (p == null || typeof p !== 'object') {
      throw new BadRequestException('Payload required');
    }
    if (
      typeof p.odometerKm !== 'number' ||
      !isFinite(p.odometerKm) ||
      p.odometerKm < 0
    ) {
      throw new BadRequestException(
        'odometerKm must be a non-negative number',
      );
    }
    if (
      typeof p.fuelPercent !== 'number' ||
      !isFinite(p.fuelPercent) ||
      p.fuelPercent < 0 ||
      p.fuelPercent > 100
    ) {
      throw new BadRequestException('fuelPercent must be between 0 and 100');
    }
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
