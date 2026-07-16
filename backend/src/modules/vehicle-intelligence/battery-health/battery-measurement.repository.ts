import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryMeasurement,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateBatteryMeasurementInput {
  organizationId: string;
  vehicleId: string;
  sessionId?: string | null;
  scope: BatteryEvidenceScope;
  type: BatteryMeasurementType;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
  quality: BatteryMeasurementQuality;
  observedAt: Date;
  receivedAt?: Date;
  providerTimestamp?: Date | null;
  providerSource?: string | null;
  signalName?: string | null;
  context?: Prisma.InputJsonValue;
  provenance?: Prisma.InputJsonValue;
  idempotencyKey: string;
}

export interface ListBatteryMeasurementsFilter {
  organizationId: string;
  vehicleId?: string;
  sessionId?: string;
  type?: BatteryMeasurementType;
  limit?: number;
}

@Injectable()
export class BatteryMeasurementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(
    input: CreateBatteryMeasurementInput,
  ): Promise<BatteryMeasurement> {
    const data: Prisma.BatteryMeasurementUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sessionId: input.sessionId ?? null,
      scope: input.scope,
      type: input.type,
      numericValue: input.numericValue ?? null,
      textValue: input.textValue ?? null,
      unit: input.unit ?? null,
      quality: input.quality,
      observedAt: input.observedAt,
      receivedAt: input.receivedAt ?? new Date(),
      providerTimestamp: input.providerTimestamp ?? null,
      providerSource: input.providerSource ?? null,
      signalName: input.signalName ?? null,
      context: input.context ?? undefined,
      provenance: input.provenance ?? undefined,
      idempotencyKey: input.idempotencyKey,
    };

    try {
      return await this.prisma.batteryMeasurement.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const byIdempotency = await this.prisma.batteryMeasurement.findUnique({
          where: {
            organizationId_vehicleId_idempotencyKey: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (byIdempotency) return byIdempotency;

        return this.prisma.batteryMeasurement.findUniqueOrThrow({
          where: {
            vehicleId_type_observedAt: {
              vehicleId: input.vehicleId,
              type: input.type,
              observedAt: input.observedAt,
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
  ): Promise<BatteryMeasurement | null> {
    return this.prisma.batteryMeasurement.findFirst({
      where: { id, organizationId },
    });
  }

  listForOrganization(
    filter: ListBatteryMeasurementsFilter,
  ): Promise<BatteryMeasurement[]> {
    const { organizationId, vehicleId, sessionId, type, limit = 50 } = filter;
    return this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        ...(vehicleId ? { vehicleId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { observedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
