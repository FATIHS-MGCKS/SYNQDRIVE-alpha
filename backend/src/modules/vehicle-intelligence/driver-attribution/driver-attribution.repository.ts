import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { UpsertDriverAttributionInput } from './driver-attribution.types';

@Injectable()
export class DriverAttributionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripInOrg(organizationId: string, tripId: string): Promise<{ vehicleId: string }> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    return { vehicleId: trip.vehicleId };
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.prisma.driverAttribution.findMany({
      where: { organizationId, tripId },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findById(organizationId: string, id: string) {
    return this.prisma.driverAttribution.findFirst({
      where: { id, organizationId },
    });
  }

  async upsertSnapshot(input: UpsertDriverAttributionInput) {
    const { vehicleId } = await this.assertTripInOrg(input.organizationId, input.tripId);
    if (vehicleId !== input.vehicleId) {
      throw new NotFoundException('Trip vehicle mismatch for organization');
    }

    const existing = await this.prisma.driverAttribution.findFirst({
      where: {
        organizationId: input.organizationId,
        tripId: input.tripId,
        analysisRunId: input.analysisRunId ?? null,
        modelVersion: input.modelVersion,
        source: input.source,
      },
    });

    const data = {
      vehicleId: input.vehicleId,
      bookingId: input.bookingId ?? null,
      customerId: input.customerId ?? null,
      driverId: input.driverId ?? null,
      attributionType: input.attributionType,
      confidence: input.confidence,
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null,
      evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
      resolvedByUserId: input.resolvedByUserId ?? null,
      resolvedAt: input.resolvedAt ?? null,
    };

    if (existing) {
      return this.prisma.driverAttribution.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.driverAttribution.create({
      data: {
        organizationId: input.organizationId,
        tripId: input.tripId,
        analysisRunId: input.analysisRunId ?? null,
        modelVersion: input.modelVersion,
        source: input.source,
        ...data,
      },
    });
  }
}
