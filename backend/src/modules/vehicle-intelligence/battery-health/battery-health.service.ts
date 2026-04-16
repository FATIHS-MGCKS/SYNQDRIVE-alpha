import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryEvidenceService } from './battery-evidence.service';

const logger = new Logger('BatteryHealthService');

const VOLTAGE_SOH_TABLE: [number, number][] = [
  [12.73, 100], [12.62, 90], [12.50, 80], [12.37, 70],
  [12.24, 60], [12.10, 50], [11.96, 40], [11.81, 30],
  [11.66, 20], [11.51, 10], [11.30, 0],
];

function estimateSohFromVoltage(restingVoltage: number): number | null {
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
  logger.warn(
    `Voltage ${restingVoltage}V outside interpolation range (11.30–12.73V), returning null`,
  );
  return null;
}

@Injectable()
export class BatteryHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryEvidence: BatteryEvidenceService,
  ) {}

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
    observedAt?: Date;
    sourceType?: BatteryEvidenceSourceType;
    provider?: string;
    quality?: string;
    documentExtractionId?: string;
    serviceEventId?: string;
  }) {
    const soh = data.restingVoltage
      ? estimateSohFromVoltage(data.restingVoltage)
      : estimateSohFromVoltage(data.voltageV);

    const snapshot = await this.prisma.batteryHealthSnapshot.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        voltageV: data.voltageV,
        sohPercent: soh,
        restingVoltage: data.restingVoltage,
        crankingVoltage: data.crankingVoltage,
        chargingVoltage: data.chargingVoltage,
        engineRunning: data.engineRunning ?? false,
        temperatureC: data.temperatureC,
        recordedAt: data.observedAt ?? new Date(),
      },
    });

    const observedAt = data.observedAt ?? new Date();
    const sourceType = data.sourceType ?? BatteryEvidenceSourceType.TELEMETRY_DERIVED;
    const provider = data.provider ?? 'DIMO';
    await this.batteryEvidence.recordMany([
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: data.voltageV,
        unit: 'V',
        observedAt,
        provider,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType,
        valueType: BatteryEvidenceValueType.RESTING_VOLTAGE_V,
        numericValue: data.restingVoltage,
        unit: 'V',
        observedAt,
        provider,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType,
        valueType: BatteryEvidenceValueType.CRANKING_VOLTAGE_V,
        numericValue: data.crankingVoltage,
        unit: 'V',
        observedAt,
        provider,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType,
        valueType: BatteryEvidenceValueType.CHARGING_VOLTAGE_V,
        numericValue: data.chargingVoltage,
        unit: 'V',
        observedAt,
        provider,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: soh,
        unit: 'percent',
        observedAt,
        provider: 'SynqDrive',
        confidence: 'voltage_proxy',
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType,
        valueType: BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
        numericValue: data.temperatureC,
        unit: 'celsius',
        observedAt,
        provider,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
      },
    ]);

    return snapshot;
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
