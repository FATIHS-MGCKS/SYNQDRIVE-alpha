import { Injectable } from '@nestjs/common';
import { Prisma, VehicleBatteryCapability } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { AssessedBatteryCapabilitySignal } from './battery-capability-preflight.types';

export interface UpsertBatteryCapabilityInput {
  organizationId: string;
  vehicleId: string;
  checkedAt: Date;
  signal: AssessedBatteryCapabilitySignal;
}

@Injectable()
export class BatteryCapabilityPreflightRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSignal(
    input: UpsertBatteryCapabilityInput,
  ): Promise<VehicleBatteryCapability> {
    const { organizationId, vehicleId, checkedAt, signal } = input;
    const existing = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: signal.signalKey,
        },
      },
    });

    const metadata = signal.metadata as Prisma.InputJsonValue;
    const firstSeenAt =
      existing?.firstSeenAt ??
      signal.firstSeenAt ??
      signal.sourceTimestamp ??
      null;

    const data: Prisma.VehicleBatteryCapabilityUncheckedCreateInput = {
      organizationId,
      vehicleId,
      signalKey: signal.signalKey,
      provider: signal.provider,
      status: signal.persistenceStatus,
      measurementType: signal.measurementType,
      firstSeenAt,
      lastSeenAt: signal.lastSeenAt,
      sourceTimestamp: signal.sourceTimestamp,
      lastValue: signal.lastValue,
      metadata,
      checkedAt,
    };

    return this.prisma.vehicleBatteryCapability.upsert({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: signal.signalKey,
        },
      },
      create: data,
      update: {
        provider: data.provider,
        status: data.status,
        measurementType: data.measurementType,
        firstSeenAt,
        lastSeenAt: data.lastSeenAt,
        sourceTimestamp: data.sourceTimestamp,
        lastValue: data.lastValue,
        metadata: data.metadata,
        checkedAt: data.checkedAt,
      },
    });
  }

  async upsertMany(
    organizationId: string,
    vehicleId: string,
    checkedAt: Date,
    signals: AssessedBatteryCapabilitySignal[],
  ): Promise<VehicleBatteryCapability[]> {
    const results: VehicleBatteryCapability[] = [];
    for (const signal of signals) {
      results.push(
        await this.upsertSignal({
          organizationId,
          vehicleId,
          checkedAt,
          signal,
        }),
      );
    }
    return results;
  }

  listForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleBatteryCapability[]> {
    return this.prisma.vehicleBatteryCapability.findMany({
      where: { organizationId, vehicleId },
      orderBy: { signalKey: 'asc' },
    });
  }
}
