import { Injectable } from '@nestjs/common';
import {
  BatteryMeasurementQuality,
  HvCapacityMethod,
  Prisma,
  type HvCapacityObservation,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  HV_M2_CAPACITY_METHOD,
  HV_M2_MODEL_VERSION,
  type HvCapacityObservationMetadata,
} from './hv-capacity-m2.types';
import {
  HV_M3_CAPACITY_METHOD,
  HV_M3_MODEL_VERSION,
  type HvCapacityM3ObservationMetadata,
} from './hv-capacity-m3.types';

export type HvCapacityObservationPersistMetadata =
  | HvCapacityObservationMetadata
  | HvCapacityM3ObservationMetadata;

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
  deltaSocPercent?: number | null;
  deltaEnergyKwh?: number | null;
  metadata: HvCapacityObservationPersistMetadata;
}

function toObservationCreateData(
  input: CreateHvCapacityObservationInput,
): Prisma.HvCapacityObservationUncheckedCreateInput {
  return {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: input.chargeSessionId,
      method: input.method,
      estimatedCapacityKwh: input.estimatedCapacityKwh,
      estimatedSohPct: null,
      referenceCapacityKwh: input.referenceCapacityKwh ?? null,
      deltaSocPercent: input.deltaSocPercent ?? null,
      deltaEnergyKwh: input.deltaEnergyKwh ?? null,
      sampleStats: undefined,
      quality: input.quality,
      modelVersion: input.modelVersion,
      observedAt: input.observedAt,
      receivedAt: input.receivedAt ?? new Date(),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as unknown as Prisma.InputJsonValue,
    };
}

@Injectable()
export class HvCapacityObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(
    input: CreateHvCapacityObservationInput,
  ): Promise<HvCapacityObservation> {
    const data = toObservationCreateData(input);

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

  async deleteSessionObservations(input: {
    chargeSessionId: string;
    methods: HvCapacityMethod[];
    modelVersion?: number;
  }): Promise<number> {
    const result = await this.prisma.hvCapacityObservation.deleteMany({
      where: {
        chargeSessionId: input.chargeSessionId,
        method: { in: input.methods },
        ...(input.modelVersion != null ? { modelVersion: input.modelVersion } : {}),
      },
    });
    return result.count;
  }

  /**
   * Fail-closed resample: commit metadata clear first, then delete M2/M3 rows and insert new M2
   * rows in one transaction. On transaction failure, observation deletes roll back but metadata
   * stays cleared so readers do not treat stale summaries as current.
   */
  async resampleSessionM2ObservationsTransactional(input: {
    sessionId: string;
    chargeSessionId: string;
    metadata: HvChargeSessionMetadata;
    creates: CreateHvCapacityObservationInput[];
  }): Promise<void> {
    const clearedMetadata: HvChargeSessionMetadata = { ...input.metadata };
    delete clearedMetadata.m2CapacitySummary;
    delete clearedMetadata.m3Validation;
    clearedMetadata.shadowEvidenceFingerprint = null;

    await this.prisma.hvChargeSession.update({
      where: { id: input.sessionId },
      data: {
        metadata: clearedMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.hvCapacityObservation.deleteMany({
        where: {
          chargeSessionId: input.chargeSessionId,
          method: { in: [HV_M2_CAPACITY_METHOD, HV_M3_CAPACITY_METHOD] },
        },
      });

      for (const createInput of input.creates) {
        try {
          await tx.hvCapacityObservation.create({
            data: toObservationCreateData(createInput),
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            const existing = await tx.hvCapacityObservation.findUnique({
              where: {
                vehicleId_idempotencyKey: {
                  vehicleId: createInput.vehicleId,
                  idempotencyKey: createInput.idempotencyKey,
                },
              },
            });
            if (existing) continue;
          }
          throw error;
        }
      }
    });
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

/** One M3 validation observation per qualified session (session-level, not pointwise). */
export function buildHvM3CapacityObservationIdempotencyKey(input: {
  chargeSessionId: string;
  modelVersion?: number;
}): string {
  const version = input.modelVersion ?? HV_M3_MODEL_VERSION;
  return ['hv-cap-m3', input.chargeSessionId, `m${version}`].join(':');
}
