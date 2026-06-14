import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryEvidenceService } from './battery-evidence.service';

/**
 * Legacy 12 V snapshot store.
 *
 * V4.8 Battery overhaul — the old static voltage→SOH lookup table that used
 * to fabricate a "12 V SOH %" from a single resting-voltage reading has been
 * removed. A resting voltage describes the charge/rest state, NOT a state of
 * health, so deriving an SOH from it produced a second, misleading source of
 * truth next to the Battery V2 / Canonical estimate.
 *
 * This service now only persists raw measurements (voltage, resting voltage,
 * crank/charging voltage, temperature) and the corresponding evidence rows.
 * The behaviour-based "Estimated Battery Health" lives in BatteryV2Service
 * and is surfaced exclusively through CanonicalBatteryHealthService.
 */
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
    // No voltage→SOH derivation: a resting voltage is a charge-state proxy,
    // not a state of health. `sohPercent` stays null for raw LV snapshots.
    const snapshot = await this.prisma.batteryHealthSnapshot.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        voltageV: data.voltageV,
        sohPercent: null,
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
