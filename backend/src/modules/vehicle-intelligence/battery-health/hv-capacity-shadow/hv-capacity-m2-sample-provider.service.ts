import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvCapacityM2Sample } from './hv-capacity-m2.types';

@Injectable()
export class HvCapacityM2SampleProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async loadSessionSamples(input: {
    vehicleId: string;
    startAt: Date;
    endAt: Date | null;
  }): Promise<HvCapacityM2Sample[]> {
    const endAt = input.endAt ?? new Date();

    const snapshots = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: {
        vehicleId: input.vehicleId,
        recordedAt: {
          gte: input.startAt,
          lte: endAt,
        },
        socPercent: { gt: 0 },
        energyUsedKwh: { not: null },
      },
      orderBy: { recordedAt: 'asc' },
      select: {
        recordedAt: true,
        energyObservedAt: true,
        providerReceivedAt: true,
        socPercent: true,
        energyUsedKwh: true,
      },
    });

    return snapshots
      .filter((row) => row.energyUsedKwh != null)
      .map((row) => {
        const socObservedAt = row.recordedAt;
        const energyObservedAt = row.energyObservedAt ?? row.recordedAt;
        return {
          observedAt: socObservedAt,
          socPercent: row.socPercent,
          currentEnergyKwh: row.energyUsedKwh as number,
          socObservedAt,
          energyObservedAt,
          receivedAt: row.providerReceivedAt,
        };
      });
  }
}
