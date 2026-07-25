import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DamageLocationView,
  DamageSeverity,
  DamageType,
} from '@prisma/client';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import type { DamageResponseDto } from '@modules/vehicle-intelligence/damages/damage.mapper';
import { PrismaService } from '@shared/database/prisma.service';
import { findDuplicateDamageCandidate } from '@shared/damage/damage-dedup.util';
import { assertDamageMutable } from '@shared/damage/damage-status-transition.util';
import { OperatorDamageAuditService } from './operator-damage-audit.service';
import { mapOperatorDamageListItem } from './operator-damage.mapper';
import {
  assertOperatorCaptureSourceAllowed,
  operatorSourceToDamageSource,
} from './operator-damage-source.util';
import type {
  OperatorDamageCaptureRequestDto,
  OperatorDamageCaptureResultDto,
  OperatorDamageListItemDto,
} from './operator-damage.types';

@Injectable()
export class OperatorDamageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly damages: DamagesService,
    private readonly audit: OperatorDamageAuditService,
  ) {}

  async listActiveForVehicle(
    orgId: string,
    vehicleId: string,
    bookingId?: string,
  ): Promise<OperatorDamageListItemDto[]> {
    await this.assertVehicleInOrg(orgId, vehicleId);
    const rows = await this.damages.findActive(vehicleId);
    const knownIds = bookingId
      ? new Set(
          (
            await this.prisma.vehicleDamage.findMany({
              where: { vehicleId, bookingId, organizationId: orgId },
              select: { id: true },
            })
          ).map((r) => r.id),
        )
      : new Set<string>();

    return rows.map((row) =>
      mapOperatorDamageListItem(row, { isKnownDamage: knownIds.has(row.id) }),
    );
  }

  async capture(
    orgId: string,
    vehicleId: string,
    dto: OperatorDamageCaptureRequestDto,
    actor: { userId: string; stationId?: string | null },
  ): Promise<OperatorDamageCaptureResultDto> {
    assertOperatorCaptureSourceAllowed(dto.source);
    await this.assertVehicleInOrg(orgId, vehicleId);
    await this.assertBookingScope(orgId, vehicleId, dto.bookingId, dto.customerId, dto.stationId);

    const idempotent = await this.prisma.operatorDamageCaptureIdempotency.findUnique({
      where: {
        organizationId_captureKey: {
          organizationId: orgId,
          captureKey: dto.captureKey,
        },
      },
    });
    if (idempotent) {
      const existing = await this.getDamageForVehicle(vehicleId, idempotent.damageId, orgId);
      await this.audit.log({
        organizationId: orgId,
        userId: actor.userId,
        event: 'OPERATOR_DAMAGE_CAPTURE_IDEMPOTENT',
        damageId: existing.id,
        vehicleId,
        bookingId: dto.bookingId ?? null,
        stationId: dto.stationId ?? actor.stationId ?? null,
        source: dto.source,
        captureKey: dto.captureKey,
      });
      return {
        damage: mapOperatorDamageListItem(existing),
        deduplicated: false,
        idempotentReplay: true,
      };
    }

    const activeRows = await this.damages.findActive(vehicleId);
    const candidateAreas = dto.locationLabel
      ? dto.locationLabel.split(',').map((p) => p.trim()).filter(Boolean)
      : [];
    const duplicate = findDuplicateDamageCandidate(
      activeRows.map((row) => ({
        id: row.id,
        damageType: row.damageType,
        severity: row.severity,
        description: row.description,
        locationLabel: row.locationLabel,
        status: row.status,
      })),
      {
        damageType: dto.damageType,
        severity: dto.severity,
        description: dto.description ?? null,
        locationLabel: dto.locationLabel ?? null,
      },
      candidateAreas,
    );

    if (duplicate) {
      const existing = await this.getDamageForVehicle(vehicleId, duplicate.id, orgId);
      await this.audit.log({
        organizationId: orgId,
        userId: actor.userId,
        event: 'OPERATOR_DAMAGE_DEDUPLICATED',
        damageId: existing.id,
        vehicleId,
        bookingId: dto.bookingId ?? null,
        stationId: dto.stationId ?? actor.stationId ?? null,
        source: dto.source,
        captureKey: dto.captureKey,
        duplicateOfDamageId: existing.id,
      });
      return {
        damage: mapOperatorDamageListItem(existing),
        deduplicated: true,
        idempotentReplay: false,
      };
    }

    const canonicalSource = operatorSourceToDamageSource(dto.source);
    const created = await this.damages.create(
      vehicleId,
      {
        damageType: dto.damageType as DamageType,
        severity: dto.severity ?? DamageSeverity.MODERATE,
        rentalImpact: dto.rentalImpact,
        description: dto.description,
        locationView: dto.locationView ?? DamageLocationView.UNKNOWN,
        locationX: dto.locationX,
        locationY: dto.locationY,
        locationLabel: dto.locationLabel,
        source: canonicalSource,
        bookingId: dto.bookingId,
        customerId: dto.customerId,
        reportedBy: dto.reportedBy,
        images: dto.images,
        // Liability always derived server-side — never accept customer-responsible from operator capture.
      },
      orgId,
    );

    await this.prisma.operatorDamageCaptureIdempotency.create({
      data: {
        organizationId: orgId,
        captureKey: dto.captureKey,
        damageId: created.id,
        vehicleId,
        bookingId: dto.bookingId ?? null,
        capturedByUserId: actor.userId,
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actor.userId,
      event: 'OPERATOR_DAMAGE_CAPTURED',
      damageId: created.id,
      vehicleId,
      bookingId: dto.bookingId ?? null,
      stationId: dto.stationId ?? actor.stationId ?? null,
      source: dto.source,
      captureKey: dto.captureKey,
    });

    return {
      damage: mapOperatorDamageListItem(created),
      deduplicated: false,
      idempotentReplay: false,
    };
  }

  async assertEditable(
    orgId: string,
    vehicleId: string,
    damageId: string,
    actor: { userId: string },
  ): Promise<DamageResponseDto> {
    await this.assertVehicleInOrg(orgId, vehicleId);
    const damage = await this.getDamageForVehicle(vehicleId, damageId, orgId);
    try {
      assertDamageMutable(damage.status);
    } catch {
      await this.audit.log({
        organizationId: orgId,
        userId: actor.userId,
        event: 'OPERATOR_DAMAGE_UPDATE_BLOCKED',
        damageId,
        vehicleId,
        meta: { status: damage.status },
      });
      throw new ConflictException('Final damage records cannot be modified silently');
    }
    return damage;
  }

  private async getDamageForVehicle(
    vehicleId: string,
    damageId: string,
    orgId: string,
  ): Promise<DamageResponseDto> {
    const row = await this.damages.findById(vehicleId, damageId);
    if (!row) {
      throw new NotFoundException('Damage not found');
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new ForbiddenException('Vehicle not in organization scope');
    }
    return row;
  }

  private async assertVehicleInOrg(orgId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new ForbiddenException('Vehicle not in organization scope');
    }
  }

  private async assertBookingScope(
    orgId: string,
    vehicleId: string,
    bookingId?: string,
    customerId?: string,
    stationId?: string,
  ): Promise<void> {
    if (!bookingId) return;
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        pickupStationId: true,
        returnStationId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.vehicleId !== vehicleId) {
      throw new BadRequestException('Booking does not belong to vehicle');
    }
    if (customerId && booking.customerId && booking.customerId !== customerId) {
      throw new BadRequestException('Customer does not belong to booking');
    }
    if (
      stationId &&
      stationId !== booking.pickupStationId &&
      stationId !== booking.returnStationId
    ) {
      throw new BadRequestException('Station not associated with booking');
    }
  }
}
