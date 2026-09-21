import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

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

  async findActiveRestSession(vehicleId: string) {
    return this.prisma.batteryRestSession.findFirst({
      where: {
        vehicleId,
        sessionStatus: { in: ['CANDIDATE', 'CONFIRMED', 'RESTING'] },
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
