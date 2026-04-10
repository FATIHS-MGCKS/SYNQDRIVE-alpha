import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

const VOLTAGE_SOH_TABLE: [number, number][] = [
  [12.73, 100], [12.62, 90], [12.50, 80], [12.37, 70],
  [12.24, 60], [12.10, 50], [11.96, 40], [11.81, 30],
  [11.66, 20], [11.51, 10], [11.30, 0],
];

function estimateSohFromVoltage(restingVoltage: number): number {
  if (restingVoltage >= 12.73) return 100;
  if (restingVoltage <= 11.30) return 0;
  for (let i = 0; i < VOLTAGE_SOH_TABLE.length - 1; i++) {
    const [v1, s1] = VOLTAGE_SOH_TABLE[i];
    const [v2, s2] = VOLTAGE_SOH_TABLE[i + 1];
    if (restingVoltage >= v2 && restingVoltage <= v1) {
      const ratio = (restingVoltage - v2) / (v1 - v2);
      return Math.round(s2 + ratio * (s1 - s2));
    }
  }
  return 50;
}

@Injectable()
export class BatteryHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(vehicleId: string, limit = 50) {
    return this.prisma.batteryHealthSnapshot.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  async getLatest(vehicleId: string) {
    return this.prisma.batteryHealthSnapshot.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async recordSnapshot(data: {
    vehicleId: string;
    voltageV: number;
    engineRunning?: boolean;
    temperatureC?: number;
    restingVoltage?: number;
    crankingVoltage?: number;
    chargingVoltage?: number;
  }) {
    const soh = data.restingVoltage
      ? estimateSohFromVoltage(data.restingVoltage)
      : estimateSohFromVoltage(data.voltageV);

    return this.prisma.batteryHealthSnapshot.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        voltageV: data.voltageV,
        sohPercent: soh,
        restingVoltage: data.restingVoltage,
        crankingVoltage: data.crankingVoltage,
        chargingVoltage: data.chargingVoltage,
        engineRunning: data.engineRunning ?? false,
        temperatureC: data.temperatureC,
        recordedAt: new Date(),
      },
    });
  }

  async getSohTrend(vehicleId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const snapshots = await this.prisma.batteryHealthSnapshot.findMany({
      where: { vehicleId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true, sohPercent: true, voltageV: true },
    });
    return snapshots;
  }
}
