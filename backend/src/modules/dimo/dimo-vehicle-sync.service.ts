import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoConnectionStatus } from '@prisma/client';

export interface DimoVehicleInput {
  id?: string;
  externalId: string;
  tokenId?: number;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  powertrainType?: string;
  odometerKm?: number;
  batteryPercent?: number;
  fuelPercent?: number;
  lastSignal?: Date;
  connectionStatus?: string;
  rawJson?: object;
}

const CONNECTION_STATUS_MAP: Record<DimoConnectionStatus, string> = {
  CONNECTED: 'Connected',
  DISCONNECTED: 'Disconnected',
  PENDING: 'Disconnected',
  ERROR: 'Disconnected',
};

@Injectable()
export class DimoVehicleSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async syncMirroredVehicles(dimoVehicles: DimoVehicleInput[]): Promise<void> {
    for (const dv of dimoVehicles) {
      await this.prisma.dimoVehicle.upsert({
        where: { externalId: dv.externalId },
        create: {
          externalId: dv.externalId,
          tokenId: dv.tokenId ?? null,
          vin: dv.vin ?? null,
          make: dv.make ?? null,
          model: dv.model ?? null,
          year: dv.year ?? null,
          fuelType: dv.fuelType ?? null,
          powertrainType: dv.powertrainType ?? null,
          odometerKm: dv.odometerKm ?? null,
          batteryPercent: dv.batteryPercent ?? null,
          fuelPercent: dv.fuelPercent ?? null,
          lastSignal: dv.lastSignal ?? null,
          connectionStatus: (dv.connectionStatus as DimoConnectionStatus) ?? 'PENDING',
          rawJson: dv.rawJson ?? undefined,
          syncedAt: new Date(),
        },
        update: {
          tokenId: dv.tokenId ?? undefined,
          vin: dv.vin ?? undefined,
          make: dv.make ?? undefined,
          model: dv.model ?? undefined,
          year: dv.year ?? undefined,
          fuelType: dv.fuelType ?? undefined,
          powertrainType: dv.powertrainType ?? undefined,
          odometerKm: dv.odometerKm ?? undefined,
          batteryPercent: dv.batteryPercent ?? undefined,
          fuelPercent: dv.fuelPercent ?? undefined,
          lastSignal: dv.lastSignal ?? undefined,
          connectionStatus: (dv.connectionStatus as DimoConnectionStatus) ?? undefined,
          rawJson: dv.rawJson ?? undefined,
          syncedAt: new Date(),
        },
      });
    }
  }

  async getNonRegisteredVehicles() {
    const registered = await this.prisma.vehicle.findMany({
      where: { dimoVehicleId: { not: null } },
      select: { dimoVehicleId: true },
    });
    const registeredIds = new Set(
      registered.map((r) => r.dimoVehicleId).filter(Boolean) as string[],
    );

    const allDimo = await this.prisma.dimoVehicle.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return allDimo
      .filter((dv) => !registeredIds.has(dv.id))
      .map((dv) => ({
        id: dv.id,
        vin: dv.vin ?? '',
        make: dv.make ?? '',
        model: dv.model ?? '',
        year: dv.year ?? 0,
        odometer: dv.odometerKm ?? 0,
        battery: dv.batteryPercent ?? null,
        fuelLevel: dv.fuelPercent ?? null,
        powertrainType: dv.powertrainType ?? null,
        lastSignal: dv.lastSignal?.toISOString() ?? '',
        connectionStatus:
          CONNECTION_STATUS_MAP[dv.connectionStatus] ?? 'Disconnected',
      }));
  }
}
