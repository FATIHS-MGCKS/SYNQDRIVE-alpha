import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceEventsService } from '../service-events/service-events.service';
import { BatteryEvidenceService, BatteryEvidenceWriteInput } from './battery-evidence.service';

export type ApplyBatteryFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  scope: BatteryEvidenceScope;
  isReplacement: boolean;
  observedAt: Date;
  odometerKm: number | null;
  workshopName: string | null;
  notes: string | null;
  documentUrl?: string | null;
  costCents?: number | null;
  measurementType: string | null;
  sohPercent: number | null;
  voltageV: number | null;
  restingVoltage: number | null;
  crankingVoltage: number | null;
  chargingVoltage: number | null;
  temperatureC: number | null;
};

export type ApplyBatteryFromDocumentExtractionResult = {
  serviceEventId: string | null;
  evidenceIds: string[];
  snapshotId: string | null;
};

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
    private readonly serviceEvents: ServiceEventsService,
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

  async applyFromDocumentExtraction(
    input: ApplyBatteryFromDocumentExtractionInput,
  ): Promise<ApplyBatteryFromDocumentExtractionResult> {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }

    const existingEvidence = await this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId: input.vehicleId,
        documentExtractionId: input.documentExtractionId,
      },
      select: { id: true },
    });
    if (existingEvidence.length > 0) {
      const serviceEvent = await this.serviceEvents.findByDocumentExtractionId(
        input.organizationId,
        input.documentExtractionId,
      );
      return {
        serviceEventId: serviceEvent?.id ?? null,
        evidenceIds: existingEvidence.map((row) => row.id),
        snapshotId: null,
      };
    }

    let serviceEventId: string | null = null;
    if (input.isReplacement) {
      const serviceEvent = await this.serviceEvents.createFromDocumentExtraction({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        documentExtractionId: input.documentExtractionId,
        documentActionIdempotencyKey: input.documentActionIdempotencyKey,
        eventType: ServiceEventType.BATTERY_REPLACEMENT,
        eventDate: input.observedAt.toISOString(),
        odometerKm:
          input.odometerKm != null ? Math.round(input.odometerKm) : null,
        workshopName: input.workshopName,
        notes: input.notes,
        costCents: input.costCents ?? null,
        documentUrl: input.documentUrl ?? null,
      });
      serviceEventId = serviceEvent.id;
    }

    const sourceType = input.isReplacement
      ? BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT
      : BatteryEvidenceSourceType.DOCUMENT_CONFIRMED;
    const quality = input.isReplacement ? 'workshop_measurement' : 'document_confirmed';
    const isLv = input.scope === BatteryEvidenceScope.LV;

    const base = (
      valueType: BatteryEvidenceValueType,
      numericValue: number | null | undefined,
      unit: string,
    ): BatteryEvidenceWriteInput => ({
      vehicleId: input.vehicleId,
      scope: input.scope,
      sourceType,
      valueType,
      numericValue,
      unit,
      observedAt: input.observedAt,
      provider: 'document_confirmed',
      confidence: 'document_confirmed',
      quality,
      documentExtractionId: input.documentExtractionId,
      serviceEventId,
      metadataJson: input.measurementType
        ? { measurementType: input.measurementType }
        : undefined,
    });

    const evidenceEntries: BatteryEvidenceWriteInput[] = [
      base(BatteryEvidenceValueType.SOH_PERCENT, input.sohPercent, 'percent'),
      base(BatteryEvidenceValueType.VOLTAGE_V, input.voltageV, 'V'),
      base(BatteryEvidenceValueType.BATTERY_TEMPERATURE_C, input.temperatureC, 'celsius'),
    ];

    if (isLv) {
      evidenceEntries.push(
        base(BatteryEvidenceValueType.RESTING_VOLTAGE_V, input.restingVoltage, 'V'),
        base(BatteryEvidenceValueType.CRANKING_VOLTAGE_V, input.crankingVoltage, 'V'),
        base(BatteryEvidenceValueType.CHARGING_VOLTAGE_V, input.chargingVoltage, 'V'),
      );
    }

    await this.batteryEvidence.recordMany(evidenceEntries);

    const persistedEvidence = await this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId: input.vehicleId,
        documentExtractionId: input.documentExtractionId,
      },
      select: { id: true },
    });

    let snapshotId: string | null = null;
    if (isLv && (input.voltageV != null || input.restingVoltage != null)) {
      const lvReferenceVoltage = input.restingVoltage ?? input.voltageV;
      if (lvReferenceVoltage != null) {
        const snapshot = await this.recordSnapshot({
          vehicleId: input.vehicleId,
          voltageV: lvReferenceVoltage,
          temperatureC: input.temperatureC ?? undefined,
          restingVoltage: input.restingVoltage ?? undefined,
          crankingVoltage: input.crankingVoltage ?? undefined,
          chargingVoltage: input.chargingVoltage ?? undefined,
          observedAt: input.observedAt,
          sourceType,
          provider: 'document_confirmed',
          quality,
          documentExtractionId: input.documentExtractionId,
          serviceEventId: serviceEventId ?? undefined,
        });
        snapshotId = snapshot.id;
      }
    }

    return {
      serviceEventId,
      evidenceIds: persistedEvidence.map((row) => row.id),
      snapshotId,
    };
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
