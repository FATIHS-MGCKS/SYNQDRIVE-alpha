import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ACTIVE_REST_SESSION_STATUSES } from './generalized-evidence.constants';

function vehicleAdvisoryLockKey(vehicleId: string): bigint {
  let hash = 0;
  for (let i = 0; i < vehicleId.length; i += 1) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) | 0;
  }
  return BigInt(Math.abs(hash));
}

@Injectable()
export class GeneralizedEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createObservationIdempotent(
    data: Prisma.BatteryGeneralizedEvidenceObservationCreateInput,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.batteryGeneralizedEvidenceObservation.create({ data });
      return 'created';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw err;
    }
  }

  async createRestSessionIdempotent(
    data: Prisma.BatteryRestSessionCreateInput,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.batteryRestSession.create({ data });
      return 'created';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw err;
    }
  }

  /**
   * Ensures at most one active rest session per vehicle under concurrent writers.
   */
  async claimOrCreateActiveRestSession(
    data: Prisma.BatteryRestSessionCreateInput,
  ): Promise<{ sessionId: string; created: boolean }> {
    const vehicleId =
      typeof data.vehicle === 'object' &&
      data.vehicle !== null &&
      'connect' in data.vehicle &&
      data.vehicle.connect &&
      'id' in data.vehicle.connect
        ? (data.vehicle.connect.id as string)
        : null;
    if (!vehicleId) {
      throw new Error('claimOrCreateActiveRestSession requires vehicle.connect.id');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${vehicleAdvisoryLockKey(vehicleId)})`;

      const existing = await tx.batteryRestSession.findFirst({
        where: {
          vehicleId,
          sessionStatus: { in: [...ACTIVE_REST_SESSION_STATUSES] },
        },
        orderBy: { anchorAt: 'desc' },
      });
      if (existing) {
        return { sessionId: existing.id, created: false };
      }

      try {
        const created = await tx.batteryRestSession.create({ data });
        return { sessionId: created.id, created: true };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const raced = await tx.batteryRestSession.findFirst({
            where: {
              vehicleId,
              sessionStatus: { in: [...ACTIVE_REST_SESSION_STATUSES] },
            },
            orderBy: { anchorAt: 'desc' },
          });
          if (raced) {
            return { sessionId: raced.id, created: false };
          }
        }
        throw err;
      }
    });
  }

  async findActiveRestSession(vehicleId: string) {
    return this.prisma.batteryRestSession.findFirst({
      where: {
        vehicleId,
        sessionStatus: { in: [...ACTIVE_REST_SESSION_STATUSES] },
      },
      orderBy: { anchorAt: 'desc' },
    });
  }

  async updateRestSession(
    id: string,
    data: Prisma.BatteryRestSessionUpdateInput,
  ) {
    return this.prisma.batteryRestSession.update({ where: { id }, data });
  }

  async linkObservationToSession(input: {
    observationId: string;
    restSessionId: string;
    actualRestAgeMs: number | null;
    tripId?: string | null;
  }) {
    return this.prisma.batteryGeneralizedEvidenceObservation.update({
      where: { id: input.observationId },
      data: {
        restSessionId: input.restSessionId,
        actualRestAgeMs: input.actualRestAgeMs,
        ...(input.tripId !== undefined ? { tripId: input.tripId } : {}),
      },
    });
  }
}
