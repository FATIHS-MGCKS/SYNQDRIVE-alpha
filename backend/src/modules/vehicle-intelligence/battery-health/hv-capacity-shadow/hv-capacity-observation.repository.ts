import { Injectable } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  HvCapacityMethod,
  Prisma,
  type HvCapacityObservation,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HV_M2_CAPACITY_METHOD,
  HV_M2_MODEL_VERSION,
  type HvCapacityObservationMetadata,
} from './hv-capacity-m2.types';

export interface CreateHvCapacityObservationInput {
  organizationId: string;
  vehicleId: string;
  chargeSessionId: string;
  method: HvCapacityMethod;
  estimatedCapacityKwh: number;
  referenceCapacityKwh?: number | null;
  quality: BatteryMeasurementQuality;
  modelVersion: number;
  observedAt: Date;
  receivedAt?: Date;
  idempotencyKey: string;
  metadata: HvCapacityObservationMetadata;
}

@Injectable()
export class HvCapacityObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(
    input: CreateHvCapacityObservationInput,
  ): Promise<HvCapacityObservation> {
    const data: Prisma.HvCapacityObservationUncheckedCreateInput = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: input.chargeSessionId,
      method: input.method,
      estimatedCapacityKwh: input.estimatedCapacityKwh,
      estimatedSohPct: null,
      referenceCapacityKwh: input.referenceCapacityKwh ?? null,
      deltaSocPercent: null,
      deltaEnergyKwh: null,
      sampleStats: undefined,
      quality: input.quality,
      modelVersion: input.modelVersion,
      observedAt: input.observedAt,
      receivedAt: input.receivedAt ?? new Date(),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as unknown as Prisma.InputJsonValue,
    };

    try {
      return await this.prisma.hvCapacityObservation.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const byIdempotency = await this.prisma.hvCapacityObservation.findUnique({
          where: {
            vehicleId_idempotencyKey: {
              vehicleId: input.vehicleId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (byIdempotency) return byIdempotency;

        return this.prisma.hvCapacityObservation.findUniqueOrThrow({
          where: {
            vehicleId_method_observedAt: {
              vehicleId: input.vehicleId,
              method: input.method,
              observedAt: input.observedAt,
            },
          },
        });
      }
      throw error;
    }
  }

  hasSessionObservations(input: {
    chargeSessionId: string;
    method: HvCapacityMethod;
    modelVersion: number;
  }): Promise<boolean> {
    return this.prisma.hvCapacityObservation
      .findFirst({
        where: {
          chargeSessionId: input.chargeSessionId,
          method: input.method,
          modelVersion: input.modelVersion,
        },
        select: { id: true },
      })
      .then((row) => row != null);
  }
}

export function buildHvCapacityObservationIdempotencyKey(input: {
  chargeSessionId: string;
  method?: string;
  observedAt: Date;
  modelVersion?: number;
}): string {
  const method = input.method ?? HV_M2_CAPACITY_METHOD;
  const version = input.modelVersion ?? HV_M2_MODEL_VERSION;
  return [
    'hv-cap-obs',
    input.chargeSessionId,
    method,
    `m${version}`,
    String(input.observedAt.getTime()),
  ].join(':');
}
