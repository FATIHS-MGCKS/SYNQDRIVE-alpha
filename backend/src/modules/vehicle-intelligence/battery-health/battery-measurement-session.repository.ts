import { Injectable } from '@nestjs/common';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementSession,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateBatteryMeasurementSessionInput {
  organizationId: string;
  vehicleId: string;
  scope: BatteryEvidenceScope;
  type: BatteryMeasurementSessionType;
  status?: BatteryMeasurementSessionStatus;
  driveProfile?: BatteryDriveProfile;
  chemistry?: BatteryChemistry;
  startedAt: Date;
  targetAt?: Date | null;
  endedAt?: Date | null;
  quality?: BatteryMeasurementQuality;
  providerSource?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  tripId?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
  modelVersion?: number;
}

export interface ListBatteryMeasurementSessionsFilter {
  organizationId: string;
  vehicleId?: string;
  status?: BatteryMeasurementSessionStatus;
  type?: BatteryMeasurementSessionType;
  limit?: number;
}

export interface UpdateBatteryMeasurementSessionInput {
  organizationId: string;
  sessionId: string;
  status?: BatteryMeasurementSessionStatus;
  endedAt?: Date | null;
  targetAt?: Date | null;
  quality?: BatteryMeasurementQuality;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class BatteryMeasurementSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(
    input: CreateBatteryMeasurementSessionInput,
  ): Promise<BatteryMeasurementSession> {
    const data: Prisma.BatteryMeasurementSessionUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: input.scope,
      type: input.type,
      status: input.status ?? BatteryMeasurementSessionStatus.PLANNED,
      driveProfile: input.driveProfile ?? BatteryDriveProfile.UNKNOWN,
      chemistry: input.chemistry ?? BatteryChemistry.UNKNOWN,
      startedAt: input.startedAt,
      targetAt: input.targetAt ?? null,
      endedAt: input.endedAt ?? null,
      quality: input.quality ?? BatteryMeasurementQuality.SHADOW,
      providerSource: input.providerSource ?? null,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      tripId: input.tripId ?? null,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? undefined,
      modelVersion: input.modelVersion ?? 1,
    };

    try {
      return await this.prisma.batteryMeasurementSession.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.batteryMeasurementSession.findUniqueOrThrow({
          where: {
            vehicleId_idempotencyKey: {
              vehicleId: input.vehicleId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      }
      throw error;
    }
  }

  findByIdForOrganization(
    organizationId: string,
    id: string,
  ): Promise<BatteryMeasurementSession | null> {
    return this.prisma.batteryMeasurementSession.findFirst({
      where: { id, organizationId },
    });
  }

  findOpenLvRestWindow(
    vehicleId: string,
  ): Promise<BatteryMeasurementSession | null> {
    return this.prisma.batteryMeasurementSession.findFirst({
      where: {
        vehicleId,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: {
          in: [
            BatteryMeasurementSessionStatus.PLANNED,
            BatteryMeasurementSessionStatus.ACTIVE,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  updateMutable(
    input: UpdateBatteryMeasurementSessionInput,
  ): Promise<BatteryMeasurementSession> {
    return this.prisma.batteryMeasurementSession.update({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
        ...(input.targetAt !== undefined ? { targetAt: input.targetAt } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }

  listForOrganization(
    filter: ListBatteryMeasurementSessionsFilter,
  ): Promise<BatteryMeasurementSession[]> {
    const { organizationId, vehicleId, status, type, limit = 50 } = filter;
    return this.prisma.batteryMeasurementSession.findMany({
      where: {
        organizationId,
        ...(vehicleId ? { vehicleId } : {}),
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
