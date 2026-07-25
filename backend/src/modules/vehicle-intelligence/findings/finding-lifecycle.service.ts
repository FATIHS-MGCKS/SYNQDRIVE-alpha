import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  VehicleFindingSourceType,
  VehicleFindingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateVehicleFindingInput {
  organizationId: string;
  vehicleId?: string | null;
  sourceType: VehicleFindingSourceType;
  sourceRef?: string | null;
  dedupeKey: string;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  detectedAt?: Date;
  metadataJson?: Prisma.InputJsonValue;
}

@Injectable()
export class FindingLifecycleService {
  private readonly logger = new Logger(FindingLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Minimal canonical finding writer — upserts by (organizationId, dedupeKey).
   * Domain-specific alert tables remain source-of-truth until bridges dual-write.
   */
  async upsertActiveFinding(input: CreateVehicleFindingInput) {
    const detectedAt = input.detectedAt ?? new Date();
    return this.prisma.vehicleFinding.upsert({
      where: {
        organizationId_dedupeKey: {
          organizationId: input.organizationId,
          dedupeKey: input.dedupeKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId ?? null,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        dedupeKey: input.dedupeKey,
        status: VehicleFindingStatus.ACTIVE,
        severity: input.severity ?? null,
        title: input.title ?? null,
        message: input.message ?? null,
        detectedAt,
        metadataJson: input.metadataJson ?? undefined,
      },
      update: {
        vehicleId: input.vehicleId ?? undefined,
        sourceRef: input.sourceRef ?? undefined,
        severity: input.severity ?? undefined,
        title: input.title ?? undefined,
        message: input.message ?? undefined,
        status: VehicleFindingStatus.ACTIVE,
        resolvedAt: null,
        acknowledgedAt: null,
        detectedAt,
        metadataJson: input.metadataJson ?? undefined,
      },
    });
  }

  async acknowledgeFinding(
    organizationId: string,
    dedupeKey: string,
    at: Date = new Date(),
  ) {
    return this.prisma.vehicleFinding.updateMany({
      where: {
        organizationId,
        dedupeKey,
        status: VehicleFindingStatus.ACTIVE,
      },
      data: {
        status: VehicleFindingStatus.ACKNOWLEDGED,
        acknowledgedAt: at,
      },
    });
  }

  async resolveFinding(
    organizationId: string,
    dedupeKey: string,
    at: Date = new Date(),
  ) {
    return this.prisma.vehicleFinding.updateMany({
      where: {
        organizationId,
        dedupeKey,
        status: { in: [VehicleFindingStatus.ACTIVE, VehicleFindingStatus.ACKNOWLEDGED] },
      },
      data: {
        status: VehicleFindingStatus.RESOLVED,
        resolvedAt: at,
      },
    });
  }

  async supersedeFinding(
    organizationId: string,
    dedupeKey: string,
    at: Date = new Date(),
  ) {
    const result = await this.prisma.vehicleFinding.updateMany({
      where: {
        organizationId,
        dedupeKey,
        status: { not: VehicleFindingStatus.RESOLVED },
      },
      data: {
        status: VehicleFindingStatus.SUPERSEDED,
        resolvedAt: at,
      },
    });
    if (result.count > 0) {
      this.logger.debug(
        `Superseded finding org=${organizationId} key=${dedupeKey} count=${result.count}`,
      );
    }
    return result;
  }
}
