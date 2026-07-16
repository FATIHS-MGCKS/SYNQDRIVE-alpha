import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  type DimoBatterySignalMap,
  toHvBatterySignalObservedAt,
} from '../../../dimo/mappers/dimo-battery-signal.mapper';
import {
  evaluateBatteryProviderObservation,
  type BatteryProviderObservationDecision,
} from '../battery-provider-observation.policy';
import {
  evaluateHvSnapshotObservation,
  type HvSnapshotObservationDecision,
} from '../hv-snapshot-observation.policy';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import type { BatteryObservationSnapshotContext } from './battery-v2-snapshot-context.types';

const LV_BATTERY_SIGNAL = 'lowVoltageBatteryCurrentVoltage';

export interface SnapshotPollBatteryFields {
  lvBatteryVoltage: number | null;
  evSoc: number | null;
  tractionBatteryCurrentEnergyKwh: number | null;
  tractionBatterySohPercent: number | null;
  tractionBatteryPowerKw: number | null;
  tractionBatteryChargingPowerKw: number | null;
  tractionBatteryAddedEnergyKwh: number | null;
  tractionBatteryChargeLimitPercent: number | null;
  tractionBatteryIsCharging: boolean | null;
  tractionBatteryChargingCableConnected: boolean | null;
  tractionBatteryTemperatureC: number | null;
  tractionBatteryGrossCapacityKwh: number | null;
  rangeKm: number | null;
  odometerKm: number | null;
}

export interface ClassifySnapshotObservationInput {
  organizationId: string;
  vehicleId: string;
  providerSource?: string;
  receivedAt: Date;
  normalized: SnapshotPollBatteryFields;
  batteryMap: DimoBatterySignalMap;
  lvBatteryObservedAt: Date | null;
  sourceEntityId?: string | null;
  correlationId?: string;
}

export interface ClassifySnapshotObservationResult {
  shouldEnqueue: boolean;
  idempotencyKey: string | null;
  hvDecision: HvSnapshotObservationDecision | null;
  lvDecision: BatteryProviderObservationDecision | null;
  snapshotContext: BatteryObservationSnapshotContext;
}

function isPlausibleLvVoltage(value: number | null): value is number {
  return value != null && value >= 9.0 && value <= 16.0;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

export function buildBatteryObservationSnapshotContext(input: {
  receivedAt: Date;
  normalized: SnapshotPollBatteryFields;
  batteryMap: DimoBatterySignalMap;
  lvBatteryObservedAt: Date | null;
}): BatteryObservationSnapshotContext {
  const signalObservedAt = toHvBatterySignalObservedAt(input.batteryMap);
  return {
    providerFetchedAt: input.receivedAt.toISOString(),
    collectionObservedAt: toIso(input.batteryMap.collectionLastSeenAt),
    lvBatteryVoltage: input.normalized.lvBatteryVoltage,
    lvBatteryObservedAt:
      toIso(input.lvBatteryObservedAt) ?? toIso(input.batteryMap.lvBatteryVoltage.observedAt),
    evSoc: input.normalized.evSoc,
    tractionBatteryCurrentEnergyKwh: input.normalized.tractionBatteryCurrentEnergyKwh,
    tractionBatterySohPercent: input.normalized.tractionBatterySohPercent,
    tractionBatteryPowerKw: input.normalized.tractionBatteryPowerKw,
    tractionBatteryChargingPowerKw: input.normalized.tractionBatteryChargingPowerKw,
    tractionBatteryAddedEnergyKwh: input.normalized.tractionBatteryAddedEnergyKwh,
    tractionBatteryChargeLimitPercent: input.normalized.tractionBatteryChargeLimitPercent,
    tractionBatteryIsCharging: input.normalized.tractionBatteryIsCharging,
    tractionBatteryChargingCableConnected: input.normalized.tractionBatteryChargingCableConnected,
    tractionBatteryTemperatureC: input.normalized.tractionBatteryTemperatureC,
    tractionBatteryGrossCapacityKwh: input.normalized.tractionBatteryGrossCapacityKwh,
    rangeKm: input.normalized.rangeKm,
    odometerKm: input.normalized.odometerKm,
    signalObservedAt: {
      soc: toIso(signalObservedAt.soc),
      currentEnergyKwh: toIso(signalObservedAt.currentEnergyKwh),
      chargingPowerKw: toIso(signalObservedAt.chargingPowerKw),
      addedEnergyKwh: toIso(signalObservedAt.addedEnergyKwh),
      providerSoh: toIso(signalObservedAt.providerSoh),
      temperatureC: toIso(signalObservedAt.temperatureC),
      chargeLimitPercent: toIso(signalObservedAt.chargeLimitPercent),
      cableConnected: toIso(signalObservedAt.cableConnected),
      isCharging: toIso(signalObservedAt.isCharging),
    },
  };
}

@Injectable()
export class BatteryV2SnapshotObservationProducer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
  ) {}

  async classify(
    input: ClassifySnapshotObservationInput,
  ): Promise<ClassifySnapshotObservationResult> {
    const providerSource = input.providerSource ?? 'DIMO';
    const snapshotContext = buildBatteryObservationSnapshotContext(input);

    let hvDecision: HvSnapshotObservationDecision | null = null;
    if (input.normalized.evSoc != null) {
      const lastSnapshot = await this.prisma.hvBatteryHealthSnapshot.findFirst({
        where: { vehicleId: input.vehicleId },
        orderBy: { recordedAt: 'desc' },
        select: {
          socPercent: true,
          energyUsedKwh: true,
          energyObservedAt: true,
          isCharging: true,
          chargingCableConnected: true,
          providerSohPercent: true,
          recordedAt: true,
          providerReceivedAt: true,
          idempotencyKey: true,
        },
      });

      hvDecision = evaluateHvSnapshotObservation({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSource,
        receivedAt: input.receivedAt,
        socPercent: input.normalized.evSoc,
        currentEnergyKwh: input.normalized.tractionBatteryCurrentEnergyKwh,
        isCharging: input.normalized.tractionBatteryIsCharging,
        cableConnected: input.normalized.tractionBatteryChargingCableConnected,
        providerReportedSohPercent: input.normalized.tractionBatterySohPercent,
        signalObservedAt: toHvBatterySignalObservedAt(input.batteryMap),
        lastSnapshot,
      });
    }

    let lvDecision: BatteryProviderObservationDecision | null = null;
    if (isPlausibleLvVoltage(input.normalized.lvBatteryVoltage)) {
      const lastLv = await this.prisma.batteryHealthSnapshot.findFirst({
        where: { vehicleId: input.vehicleId },
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true, voltageV: true },
      });

      const lvObservedAt =
        input.lvBatteryObservedAt ?? input.batteryMap.lvBatteryVoltage.observedAt;

      lvDecision = evaluateBatteryProviderObservation({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        signalName: LV_BATTERY_SIGNAL,
        providerSource,
        normalizedValue: input.normalized.lvBatteryVoltage,
        observedAt: lvObservedAt,
        receivedAt: input.receivedAt,
        lastStored: lastLv
          ? {
              observedAt: lastLv.recordedAt,
              normalizedValue: lastLv.voltageV,
            }
          : null,
      });
    }

    const idempotencyKey =
      hvDecision?.shouldPersist && hvDecision.idempotencyKey
        ? hvDecision.idempotencyKey
        : lvDecision?.shouldPersist && lvDecision.idempotencyKey
          ? lvDecision.idempotencyKey
          : null;

    const shouldEnqueue = idempotencyKey != null;

    return {
      shouldEnqueue,
      idempotencyKey,
      hvDecision,
      lvDecision,
      snapshotContext,
    };
  }

  /**
   * Classify provider observations and enqueue a durable Battery V2 job.
   * Throws on queue errors so the parent snapshot job can retry.
   */
  async classifyAndEnqueue(input: ClassifySnapshotObservationInput): Promise<string | null> {
    const result = await this.classify(input);
    if (!result.shouldEnqueue || !result.idempotencyKey) {
      return null;
    }

    return this.jobProducer.enqueue(
      'BATTERY_OBSERVATION_CLASSIFY',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey: result.idempotencyKey,
        sourceEntityId: input.sourceEntityId ?? null,
        snapshotContext: result.snapshotContext,
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      },
      undefined,
    );
  }
}
