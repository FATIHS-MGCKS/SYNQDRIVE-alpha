import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HandoverKind } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HANDOVER_ERROR_CODES } from './handover-error.codes';
import type {
  CreateHandoverCommand,
  HandoverValidationContext,
} from './handover-command.types';

@Injectable()
export class HandoverValidationService {
  constructor(private readonly prisma: PrismaService) {}

  assertBookingStatus(kind: HandoverKind, currentStatus: string): void {
    const expected = kind === 'PICKUP' ? 'CONFIRMED' : 'ACTIVE';
    if (currentStatus !== expected) {
      throw new ConflictException({
        message:
          kind === 'PICKUP'
            ? `Übergabe nicht möglich: Buchung ist bereits im Status ${currentStatus}. Pickup erfordert Status CONFIRMED.`
            : `Rückgabe nicht möglich: Buchung ist im Status ${currentStatus}. Return erfordert Status ACTIVE.`,
        code:
          kind === 'PICKUP'
            ? HANDOVER_ERROR_CODES.PICKUP_WRONG_STATUS
            : HANDOVER_ERROR_CODES.RETURN_WRONG_STATUS,
        currentStatus,
      });
    }
  }

  resolvePerformedAt(
    command: CreateHandoverCommand,
    kind: HandoverKind,
    scheduledStartDate: Date,
  ): Date | null {
    if (kind !== 'PICKUP') return null;
    if (command.performedAt == null || command.performedAt === '') return null;

    const parsed = new Date(command.performedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        message: 'performedAt muss ein gültiger ISO-8601 Zeitstempel sein',
        code: HANDOVER_ERROR_CODES.PERFORMED_AT_INVALID,
      });
    }

    const now = Date.now();
    if (parsed.getTime() > now + 60_000) {
      throw new BadRequestException({
        message: 'performedAt darf nicht in der Zukunft liegen',
        code: HANDOVER_ERROR_CODES.PERFORMED_AT_FUTURE,
      });
    }

    const earliestAllowed = scheduledStartDate.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() < earliestAllowed) {
      throw new BadRequestException({
        message: 'performedAt darf höchstens 7 Tage vor dem geplanten Pickup liegen',
        code: HANDOVER_ERROR_CODES.PERFORMED_AT_TOO_EARLY,
      });
    }

    return parsed;
  }

  assertOdometerRules(
    command: CreateHandoverCommand,
    ctx: HandoverValidationContext,
  ): void {
    if (command.odometerKm < 0) {
      throw new BadRequestException({
        message: 'odometerKm must be a non-negative number',
        code: HANDOVER_ERROR_CODES.ODOMETER_NEGATIVE,
      });
    }

    if (ctx.kind !== 'RETURN' || ctx.pickupOdometerKm == null) return;

    if (command.odometerKm >= ctx.pickupOdometerKm) return;

    const reason = command.odometerOverrideReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException({
        message:
          'Return odometer below pickup requires odometerOverrideReason (min 10 characters)',
        code: HANDOVER_ERROR_CODES.ODOMETER_OVERRIDE_REASON_REQUIRED,
        pickupOdometerKm: ctx.pickupOdometerKm,
        returnOdometerKm: command.odometerKm,
      });
    }

    if (!ctx.hasOverridePermission) {
      throw new ForbiddenException({
        message: 'Missing booking.override permission for odometer override',
        code: HANDOVER_ERROR_CODES.ODOMETER_OVERRIDE_DENIED,
      });
    }
  }

  assertWarningLightsNotes(command: CreateHandoverCommand): void {
    if (command.warningLightsOn && !command.warningLightsNotes?.trim()) {
      throw new BadRequestException({
        message: 'warningLightsNotes required when warningLightsOn is true',
        code: HANDOVER_ERROR_CODES.WARNING_LIGHTS_NOTES_REQUIRED,
      });
    }
  }

  async assertTenantScopedReferences(
    command: CreateHandoverCommand,
    ctx: HandoverValidationContext,
  ): Promise<void> {
    if (command.actualStationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: command.actualStationId, organizationId: ctx.organizationId },
        select: { id: true, pickupEnabled: true, returnEnabled: true },
      });
      if (!station) {
        throw new NotFoundException({
          message: 'Station not found for organization',
          code: HANDOVER_ERROR_CODES.STATION_NOT_FOUND,
        });
      }
      const enabled = ctx.kind === 'PICKUP' ? station.pickupEnabled : station.returnEnabled;
      if (!enabled) {
        throw new BadRequestException({
          message: `Station does not allow ${ctx.kind === 'PICKUP' ? 'pickup' : 'return'} handover`,
          code: HANDOVER_ERROR_CODES.STATION_NOT_ENABLED,
        });
      }
    }

    const damageIds = command.damageIds ?? [];
    if (damageIds.length === 0) return;

    const damages = await this.prisma.vehicleDamage.findMany({
      where: {
        id: { in: damageIds },
        organizationId: ctx.organizationId,
      },
      select: { id: true, vehicleId: true },
    });

    if (damages.length !== damageIds.length) {
      throw new NotFoundException({
        message: 'One or more damage IDs not found for organization',
        code: HANDOVER_ERROR_CODES.DAMAGE_ID_NOT_FOUND,
      });
    }

    const mismatched = damages.filter((d) => d.vehicleId !== ctx.vehicleId);
    if (mismatched.length > 0) {
      throw new BadRequestException({
        message: 'Damage IDs must belong to the booking vehicle',
        code: HANDOVER_ERROR_CODES.DAMAGE_VEHICLE_MISMATCH,
        damageIds: mismatched.map((d) => d.id),
      });
    }
  }

  assertOverridePermission(
    overrideReason: string | null | undefined,
    hasOverridePermission: boolean,
  ): void {
    const reason = overrideReason?.trim();
    if (!reason) {
      throw new BadRequestException({
        message: 'Override reason is required',
        code: HANDOVER_ERROR_CODES.OVERRIDE_REASON_REQUIRED,
      });
    }
    if (!hasOverridePermission) {
      throw new ForbiddenException({
        message: 'Missing booking.override permission',
        code: HANDOVER_ERROR_CODES.OVERRIDE_DENIED,
      });
    }
  }
}
