import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  stabilize,
  shouldPublish,
  determineHvMaturity,
  daysBetween,
  type PublicationState,
} from './soh-publication';
import { BatteryEvidenceService } from './battery-evidence.service';

/**
 * HV (High-Voltage) Battery Health Service for EV traction batteries.
 *
 * SOH Calculation (industry-standard capacity-based approach):
 *   SOH (%) = (Estimated Current Capacity / Nominal Capacity) × 100
 *
 * Current capacity is estimated from energy throughput between SoC readings:
 *   ΔEnergy = energy consumed/charged between two observations
 *   ΔSoC = change in state of charge
 *   Estimated Capacity = ΔEnergy / (|ΔSoC| / 100)
 *
 * V4.8 Battery overhaul — the previous age+mileage degradation fallback has
 * been removed. HV SOH is now only produced from a real data basis (provider
 * SOH, capacity/energy measurement, or a workshop/document report). When no
 * such basis exists the SOH is reported as unavailable (`insufficient_data`)
 * instead of a fabricated pseudo-precise percentage.
 */
@Injectable()
export class HvBatteryHealthService {
  private readonly logger = new Logger(HvBatteryHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryEvidence: BatteryEvidenceService,
  ) {}

  async getHvBatteryStatus(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        fuelType: true,
        hvBatteryCapacityKwh: true,
      },
    });

    if (!vehicle) return null;

    const isEv = vehicle.fuelType === 'ELECTRIC' || vehicle.fuelType === 'PLUGIN_HYBRID';
    if (!isEv) return null;

    const nominalCapacity = vehicle.hvBatteryCapacityKwh;
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        evSoc: true,
        odometerKm: true,
        rangeKm: true,
        tractionBatteryPowerKw: true,
        tractionBatterySohPercent: true,
        tractionBatteryTemperatureC: true,
        tractionBatteryChargingPowerKw: true,
        tractionBatteryIsCharging: true,
        tractionBatteryChargingCableConnected: true,
        tractionBatteryCurrentVoltage: true,
        tractionBatteryGrossCapacityKwh: true,
        tractionBatteryCurrentEnergyKwh: true,
        tractionBatteryAddedEnergyKwh: true,
        lastSeenAt: true,
      },
    });

    const snapshots = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    const sohResult = this.calculateSoh(nominalCapacity, snapshots);

    const chargingSessions = this.deriveChargingSessions(snapshots);

    const recentTrend = snapshots
      .filter((s) => s.sohPercent != null)
      .slice(0, 30)
      .reverse()
      .map((s) => ({
        date: s.recordedAt.toISOString(),
        sohPercent: s.sohPercent,
        socPercent: s.socPercent,
        estimatedCapacityKwh: s.estimatedCapacityKwh,
      }));

    // Publication pipeline: read or compute current publication state
    const pubCurrent = await this.prisma.hvBatteryHealthCurrent.findUnique({
      where: { vehicleId },
    });

    const publishedSoh = pubCurrent?.publishedSohPct ?? null;
    const publicationState = pubCurrent?.publicationState ?? 'INITIAL_CALIBRATION';
    const publicationMethod = pubCurrent?.publicationMethod ?? sohResult.method;
    const maturityConfidence = pubCurrent?.maturityConfidence ?? 'none';

    const latestProviderSohEvidence = await this.batteryEvidence.getLatest(
      vehicleId,
      {
        scope: BatteryEvidenceScope.HV,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
      },
    );
    const providerSohValue = latestProviderSohEvidence?.numericValue
      ?? latestState?.tractionBatterySohPercent
      ?? null;
    const providerSohObservedAt = latestProviderSohEvidence?.observedAt
      ?? latestState?.lastSeenAt
      ?? null;
    const providerSohAgeMs = providerSohObservedAt
      ? Math.max(0, Date.now() - providerSohObservedAt.getTime())
      : null;
    const providerSohIsFresh = providerSohAgeMs != null && providerSohAgeMs <= 45 * 24 * 60 * 60 * 1000;

    // User-facing SOH: published when maturity allows, otherwise null
    const userFacingSoh = publicationState === 'INITIAL_CALIBRATION' ? null : publishedSoh;
    const resolvedSoh =
      providerSohIsFresh && providerSohValue != null
        ? providerSohValue
        : userFacingSoh ?? sohResult.sohPercent;
    const resolvedMethod =
      providerSohIsFresh && providerSohValue != null
        ? 'provider_reported_soh'
        : sohResult.method;
    const sohSourceType =
      providerSohIsFresh && providerSohValue != null
        ? 'provider_reported'
        : sohResult.method === 'degradation_model'
          ? 'model_derived'
          : 'telemetry_derived';

    return {
      isEv: true,
      nominalCapacityKwh: nominalCapacity,
      providerNominalCapacityKwh: latestState?.tractionBatteryGrossCapacityKwh ?? null,
      currentSocPercent: latestState?.evSoc ?? snapshots[0]?.socPercent ?? null,
      estimatedRangeKm: latestState?.rangeKm ?? snapshots[0]?.rangeKm ?? null,
      sohPercent: resolvedSoh,
      rawSohPercent: sohResult.sohPercent,
      providerReportedSohPercent: providerSohValue,
      publishedSohPercent: publishedSoh,
      sohMethod: resolvedMethod,
      sohSourceType,
      publicationState,
      publicationMethod,
      maturityConfidence,
      validEstimateCount: pubCurrent?.validEstimateCount ?? 0,
      sohInterpretation: this.interpretSoh(
        publicationState !== 'INITIAL_CALIBRATION' ? resolvedSoh : null,
      ),
      estimatedCurrentCapacityKwh: sohResult.estimatedCapacity,
      snapshotCount: snapshots.length,
      chargingSessions,
      recentTrend,
      lastRecordedAt: snapshots[0]?.recordedAt?.toISOString() ?? null,
      telemetry: {
        temperatureC: latestState?.tractionBatteryTemperatureC ?? null,
        chargingPowerKw:
          latestState?.tractionBatteryChargingPowerKw
          ?? latestState?.tractionBatteryPowerKw
          ?? null,
        isCharging: latestState?.tractionBatteryIsCharging ?? null,
        chargingCableConnected:
          latestState?.tractionBatteryChargingCableConnected ?? null,
        currentVoltageV: latestState?.tractionBatteryCurrentVoltage ?? null,
        currentEnergyKwh: latestState?.tractionBatteryCurrentEnergyKwh ?? null,
        addedEnergyKwh: latestState?.tractionBatteryAddedEnergyKwh ?? null,
      },
      providerSohObservedAt: providerSohObservedAt?.toISOString() ?? null,
    };
  }

  private calculateSoh(
    nominalCapacity: number | null,
    snapshots: { socPercent: number; energyUsedKwh: number | null; estimatedCapacityKwh: number | null; odometerKm: number | null; recordedAt: Date }[],
  ): { sohPercent: number | null; estimatedCapacity: number | null; method: string } {
    // Method 1: Use stored estimated capacity values from snapshots
    const capacityEstimates = snapshots
      .filter((s) => s.estimatedCapacityKwh != null && s.estimatedCapacityKwh > 0)
      .map((s) => s.estimatedCapacityKwh!);

    if (nominalCapacity && nominalCapacity > 0 && capacityEstimates.length >= 3) {
      const avgRecent = capacityEstimates.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(capacityEstimates.length, 10);
      const soh = Math.max(0, Math.min(100, Math.round((avgRecent / nominalCapacity) * 100)));
      return { sohPercent: soh, estimatedCapacity: Math.round(avgRecent * 10) / 10, method: 'capacity_measurement' };
    }

    // Method 2: Derive from consecutive SoC readings with energy data
    if (nominalCapacity && nominalCapacity > 0 && snapshots.length >= 2) {
      const derivedCapacities: number[] = [];
      for (let i = 0; i < snapshots.length - 1; i++) {
        const current = snapshots[i];
        const previous = snapshots[i + 1];
        if (current.energyUsedKwh != null && previous.energyUsedKwh != null) {
          const deltaSoc = Math.abs(current.socPercent - previous.socPercent);
          const deltaEnergy = Math.abs(current.energyUsedKwh - previous.energyUsedKwh);
          if (deltaSoc >= 5 && deltaEnergy > 0) {
            const estimated = (deltaEnergy / deltaSoc) * 100;
            if (estimated > nominalCapacity * 0.5 && estimated < nominalCapacity * 1.2) {
              derivedCapacities.push(estimated);
            }
          }
        }
      }
      if (derivedCapacities.length >= 2) {
        const avg = derivedCapacities.reduce((a, b) => a + b, 0) / derivedCapacities.length;
        const soh = Math.max(0, Math.min(100, Math.round((avg / nominalCapacity) * 100)));
        return { sohPercent: soh, estimatedCapacity: Math.round(avg * 10) / 10, method: 'energy_throughput' };
      }
    }

    // No age/km fallback model. Without a measured capacity / energy basis the
    // HV SOH is genuinely unavailable — we never fabricate a percentage.
    return { sohPercent: null, estimatedCapacity: null, method: 'insufficient_data' };
  }

  private interpretSoh(soh: number | null): { label: string; color: string; description: string } {
    if (soh == null) return { label: 'Unknown', color: 'gray', description: 'Insufficient data to determine battery health.' };
    if (soh >= 90) return { label: 'Excellent', color: 'green', description: 'Battery in excellent condition. Minimal degradation detected.' };
    if (soh >= 80) return { label: 'Good', color: 'green', description: 'Battery in good condition. Normal age-related degradation.' };
    if (soh >= 70) return { label: 'Fair', color: 'amber', description: 'Battery showing moderate degradation. Monitor capacity trends.' };
    if (soh >= 60) return { label: 'Degraded', color: 'orange', description: 'Noticeable capacity loss. Consider battery assessment.' };
    return { label: 'Critical', color: 'red', description: 'Significant capacity loss. Battery replacement may be needed.' };
  }

  private deriveChargingSessions(
    snapshots: { socPercent: number; chargingPowerKw: number | null; isCharging: boolean; energyUsedKwh: number | null; rangeKm: number | null; odometerKm: number | null; recordedAt: Date }[],
  ) {
    const sessions: {
      startTime: string;
      endTime: string;
      startSoc: number;
      endSoc: number;
      energyChargedKwh: number | null;
      maxChargingPowerKw: number | null;
      durationMinutes: number;
      rangeGainedKm: number | null;
    }[] = [];

    let sessionStart: typeof snapshots[0] | null = null;
    let maxPower = 0;

    for (let i = snapshots.length - 1; i >= 0; i--) {
      const s = snapshots[i];
      if (s.isCharging && !sessionStart) {
        sessionStart = s;
        maxPower = s.chargingPowerKw ?? 0;
      } else if (s.isCharging && sessionStart) {
        maxPower = Math.max(maxPower, s.chargingPowerKw ?? 0);
      } else if (!s.isCharging && sessionStart) {
        const prev = snapshots[i + 1] || s;
        const durationMs = prev.recordedAt.getTime() - sessionStart.recordedAt.getTime();
        sessions.push({
          startTime: sessionStart.recordedAt.toISOString(),
          endTime: prev.recordedAt.toISOString(),
          startSoc: sessionStart.socPercent,
          endSoc: prev.socPercent,
          energyChargedKwh: prev.energyUsedKwh != null && sessionStart.energyUsedKwh != null
            ? Math.abs(prev.energyUsedKwh - sessionStart.energyUsedKwh) : null,
          maxChargingPowerKw: maxPower > 0 ? Math.round(maxPower * 10) / 10 : null,
          durationMinutes: Math.round(durationMs / 60000),
          rangeGainedKm: prev.rangeKm != null && sessionStart.rangeKm != null
            ? Math.round(prev.rangeKm - sessionStart.rangeKm) : null,
        });
        sessionStart = null;
        maxPower = 0;
      }
    }

    // Fallback: derive pseudo-sessions from SoC increases when no isCharging flag
    if (sessions.length === 0 && snapshots.length >= 2) {
      for (let i = 0; i < snapshots.length - 1; i++) {
        const current = snapshots[i];
        const next = snapshots[i + 1];
        const socGain = current.socPercent - next.socPercent;
        if (socGain >= 5) {
          const durationMs = current.recordedAt.getTime() - next.recordedAt.getTime();
          sessions.push({
            startTime: next.recordedAt.toISOString(),
            endTime: current.recordedAt.toISOString(),
            startSoc: next.socPercent,
            endSoc: current.socPercent,
            energyChargedKwh: null,
            maxChargingPowerKw: null,
            durationMinutes: Math.round(durationMs / 60000),
            rangeGainedKm: current.rangeKm != null && next.rangeKm != null
              ? Math.round(current.rangeKm - next.rangeKm) : null,
          });
        }
      }
    }

    return sessions.slice(0, 20);
  }

  /**
   * Upsert the HV publication state after any new data arrives.
   * Runs the three-layer pipeline: raw → stabilized → published.
   */
  private async upsertPublicationState(vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { hvBatteryCapacityKwh: true },
    });
    if (!vehicle) return;

    const snapshots = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    const sohResult = this.calculateSoh(vehicle.hvBatteryCapacityKwh, snapshots);

    const rawSoh = sohResult.sohPercent;
    if (rawSoh == null) return;

    const now = new Date();
    const current = await this.prisma.hvBatteryHealthCurrent.findUnique({
      where: { vehicleId },
    });

    // Count valid estimates for maturity
    const capacityEstimates = snapshots.filter(
      (s) => s.estimatedCapacityKwh != null && s.estimatedCapacityKwh > 0,
    ).length;
    const energyPairCount = this.countEnergyThroughputPairs(snapshots, vehicle.hvBatteryCapacityKwh);
    const validEstimateCount = Math.max(capacityEstimates, energyPairCount);

    const firstSnapshot = snapshots.length > 0
      ? snapshots[snapshots.length - 1].recordedAt
      : null;
    const firstUsable = current?.firstUsableMeasurementAt ?? firstSnapshot;

    // Layer 2: Stabilize
    const alpha = current?.ewmaAlpha ?? 0.20;
    const { stabilized, wasOutlier } = stabilize(
      current?.stabilizedSohPct ?? null,
      rawSoh,
      alpha,
    );

    // Layer 3: Maturity
    const days = daysBetween(firstUsable, now);
    const pubState: PublicationState = determineHvMaturity({
      validEstimateCount,
      daysSinceFirstMeasurement: days,
      method: sohResult.method,
    });

    // Signal confidence based on method
    const signalConf = sohResult.method === 'capacity_measurement' ? 'high'
      : sohResult.method === 'energy_throughput' ? 'medium'
      : 'low';

    const maturityConf = pubState === 'STABLE' ? 'high'
      : pubState === 'STABILIZING' ? 'medium'
      : 'low';

    // Publication hysteresis
    let publishedSoh = current?.publishedSohPct ?? null;
    let lastPublishedAt = current?.lastPublishedAt ?? null;

    if (pubState !== 'INITIAL_CALIBRATION') {
      const rounded = Math.round(stabilized);
      const stateChanged = current ? pubState !== current.publicationState : true;
      if (stateChanged || shouldPublish(rounded, publishedSoh)) {
        publishedSoh = rounded;
        lastPublishedAt = now;
      }
    }

    await this.prisma.hvBatteryHealthCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        rawSohPct: rawSoh,
        stabilizedSohPct: stabilized,
        publishedSohPct: publishedSoh,
        publicationState: pubState,
        publicationMethod: sohResult.method,
        maturityConfidence: maturityConf,
        signalConfidence: signalConf,
        validEstimateCount,
        firstUsableMeasurementAt: firstUsable,
        lastPublishedAt: lastPublishedAt,
        outlierSuppressedCount: wasOutlier ? 1 : 0,
        ewmaAlpha: alpha,
      },
      update: {
        rawSohPct: rawSoh,
        stabilizedSohPct: stabilized,
        publishedSohPct: publishedSoh,
        publicationState: pubState,
        publicationMethod: sohResult.method,
        maturityConfidence: maturityConf,
        signalConfidence: signalConf,
        validEstimateCount,
        firstUsableMeasurementAt: firstUsable,
        lastPublishedAt: lastPublishedAt,
        outlierSuppressedCount: (current?.outlierSuppressedCount ?? 0) + (wasOutlier ? 1 : 0),
      },
    });
  }

  private countEnergyThroughputPairs(
    snapshots: { socPercent: number; energyUsedKwh: number | null }[],
    nominalCapacity: number | null,
  ): number {
    if (!nominalCapacity || nominalCapacity <= 0) return 0;
    let count = 0;
    for (let i = 0; i < snapshots.length - 1; i++) {
      const c = snapshots[i];
      const p = snapshots[i + 1];
      if (c.energyUsedKwh != null && p.energyUsedKwh != null) {
        const deltaSoc = Math.abs(c.socPercent - p.socPercent);
        const deltaEnergy = Math.abs(c.energyUsedKwh - p.energyUsedKwh);
        if (deltaSoc >= 5 && deltaEnergy > 0) {
          const estimated = (deltaEnergy / deltaSoc) * 100;
          if (estimated > nominalCapacity * 0.5 && estimated < nominalCapacity * 1.2) {
            count++;
          }
        }
      }
    }
    return count;
  }

  async recordSnapshot(data: {
    vehicleId: string;
    socPercent: number;
    energyUsedKwh?: number;
    rangeKm?: number;
    chargingPowerKw?: number;
    isCharging?: boolean;
    odometerKm?: number;
    temperatureC?: number;
    nominalCapacityKwh?: number;
    providerReportedSohPercent?: number;
    providerSource?: string;
    observedAt?: Date;
  }) {
    let estimatedCapacity: number | null = null;
    let soh: number | null = null;

    if (data.nominalCapacityKwh && data.energyUsedKwh != null) {
      const previous = await this.prisma.hvBatteryHealthSnapshot.findFirst({
        where: { vehicleId: data.vehicleId },
        orderBy: { recordedAt: 'desc' },
      });
      if (previous && previous.energyUsedKwh != null) {
        const deltaSoc = Math.abs(data.socPercent - previous.socPercent);
        const deltaEnergy = Math.abs(data.energyUsedKwh - previous.energyUsedKwh);
        if (deltaSoc >= 5 && deltaEnergy > 0) {
          estimatedCapacity = Math.round(((deltaEnergy / deltaSoc) * 100) * 10) / 10;
          if (estimatedCapacity > data.nominalCapacityKwh * 0.5 && estimatedCapacity < data.nominalCapacityKwh * 1.2) {
            soh = Math.max(0, Math.min(100, Math.round((estimatedCapacity / data.nominalCapacityKwh) * 100)));
          } else {
            estimatedCapacity = null;
          }
        }
      }
    }

    const snapshot = await this.prisma.hvBatteryHealthSnapshot.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        socPercent: data.socPercent,
        energyUsedKwh: data.energyUsedKwh ?? null,
        estimatedCapacityKwh: estimatedCapacity,
        sohPercent: soh,
        rangeKm: data.rangeKm ?? null,
        chargingPowerKw: data.chargingPowerKw ?? null,
        isCharging: data.isCharging ?? false,
        odometerKm: data.odometerKm ?? null,
        temperatureC: data.temperatureC ?? null,
        recordedAt: data.observedAt ?? new Date(),
      },
    });

    const observedAt = data.observedAt ?? new Date();
    await this.batteryEvidence.recordMany([
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.SOC_PERCENT,
        numericValue: data.socPercent,
        unit: 'percent',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.RANGE_KM,
        numericValue: data.rangeKm,
        unit: 'km',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
        numericValue: data.temperatureC,
        unit: 'celsius',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.CHARGING_POWER_KW,
        numericValue: data.chargingPowerKw,
        unit: 'kW',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.CURRENT_ENERGY_KWH,
        numericValue: data.energyUsedKwh,
        unit: 'kWh',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: soh,
        unit: 'percent',
        observedAt,
        provider: 'SynqDrive',
        confidence: soh == null ? null : 'derived_from_energy',
      },
      {
        vehicleId: data.vehicleId,
        scope: BatteryEvidenceScope.HV,
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: data.providerReportedSohPercent,
        unit: 'percent',
        observedAt,
        provider: data.providerSource ?? 'DIMO',
      },
    ]);

    // Update publication pipeline after new data
    this.upsertPublicationState(data.vehicleId).catch((err) =>
      this.logger.warn(`HV publication state update failed for ${data.vehicleId}: ${err instanceof Error ? err.message : err}`),
    );

    return snapshot;
  }
}
