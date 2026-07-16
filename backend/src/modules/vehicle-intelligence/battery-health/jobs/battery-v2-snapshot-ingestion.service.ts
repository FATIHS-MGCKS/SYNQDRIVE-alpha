import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2HvRechargeSessionEnabled } from '@config/battery-health-v2.config';
import type { HvBatterySignalObservedAt } from '../../../dimo/mappers/dimo-battery-signal.mapper';
import { BatteryV2Service } from '../battery-v2.service';
import { HvBatteryHealthService } from '../hv-battery-health.service';
import { HvRechargeSessionReconcileProducerService } from '../hv-charge-session/hv-recharge-session-reconcile-producer.service';
import { BatteryV2ProviderError } from './battery-v2-job.errors';
import type { BatteryObservationClassifyPayload } from './battery-v2-job.types';
import type { BatteryObservationSnapshotContext } from './battery-v2-snapshot-context.types';

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toSignalObservedAt(
  ctx: BatteryObservationSnapshotContext,
): HvBatterySignalObservedAt | undefined {
  const sig = ctx.signalObservedAt;
  if (!sig) return undefined;
  return {
    soc: parseIso(sig.soc),
    currentEnergyKwh: parseIso(sig.currentEnergyKwh),
    chargingPowerKw: parseIso(sig.chargingPowerKw),
    addedEnergyKwh: parseIso(sig.addedEnergyKwh),
    providerSoh: parseIso(sig.providerSoh),
    temperatureC: parseIso(sig.temperatureC),
    chargeLimitPercent: parseIso(sig.chargeLimitPercent),
    cableConnected: parseIso(sig.cableConnected),
    isCharging: parseIso(sig.isCharging),
  };
}

/**
 * Bridges Battery V2 queue consumers to existing ingestion services until
 * full domain logic migrates into dedicated handlers (Prompt 22+).
 */
@Injectable()
export class BatteryV2SnapshotIngestionService {
  private readonly logger = new Logger(BatteryV2SnapshotIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batteryV2: BatteryV2Service,
    private readonly hvBattery: HvBatteryHealthService,
    private readonly rechargeReconcileProducer: HvRechargeSessionReconcileProducerService,
  ) {}

  async ingestObservationClassify(payload: BatteryObservationClassifyPayload): Promise<void> {
    const ctx = payload.snapshotContext;
    if (!ctx) {
      throw new BatteryV2ProviderError(
        'BATTERY_OBSERVATION_CLASSIFY missing snapshotContext — provider payload required',
        { retryable: false, jobType: 'BATTERY_OBSERVATION_CLASSIFY' },
      );
    }

    const receivedAt = parseIso(ctx.providerFetchedAt) ?? new Date();
    const previousChargingState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: payload.vehicleId },
      select: { tractionBatteryIsCharging: true },
    });

    if (ctx.lvBatteryVoltage != null) {
      await this.batteryV2.onSnapshot(
        payload.vehicleId,
        ctx.lvBatteryVoltage,
        parseIso(ctx.lvBatteryObservedAt) ?? null,
      );
    }

    if (ctx.evSoc != null) {
      const signalObservedAt = toSignalObservedAt(ctx);
      await this.hvBattery.recordSnapshot({
        vehicleId: payload.vehicleId,
        organizationId: payload.organizationId,
        socPercent: ctx.evSoc,
        currentEnergyKwh: ctx.tractionBatteryCurrentEnergyKwh ?? undefined,
        energyUsedKwh: ctx.tractionBatteryCurrentEnergyKwh ?? undefined,
        rangeKm: ctx.rangeKm ?? undefined,
        chargingPowerKw:
          ctx.tractionBatteryChargingPowerKw ?? ctx.tractionBatteryPowerKw ?? undefined,
        addedEnergyKwh: ctx.tractionBatteryAddedEnergyKwh ?? undefined,
        chargeLimitPercent: ctx.tractionBatteryChargeLimitPercent ?? undefined,
        isCharging: ctx.tractionBatteryIsCharging ?? undefined,
        cableConnected: ctx.tractionBatteryChargingCableConnected ?? undefined,
        odometerKm: ctx.odometerKm ?? undefined,
        temperatureC: ctx.tractionBatteryTemperatureC ?? undefined,
        nominalCapacityKwh: ctx.tractionBatteryGrossCapacityKwh ?? undefined,
        providerReportedSohPercent: ctx.tractionBatterySohPercent ?? undefined,
        providerSource: 'DIMO',
        receivedAt,
        collectionObservedAt: parseIso(ctx.collectionObservedAt),
        signalObservedAt,
        observedAt:
          signalObservedAt?.soc ?? parseIso(ctx.collectionObservedAt) ?? undefined,
      });
    }

    if (
      isBatteryV2HvRechargeSessionEnabled() &&
      ctx.tractionBatteryIsCharging != null &&
      previousChargingState?.tractionBatteryIsCharging !== ctx.tractionBatteryIsCharging
    ) {
      await this.rechargeReconcileProducer.enqueueForChargingTransition({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        isCharging: ctx.tractionBatteryIsCharging,
        observedAt: parseIso(ctx.signalObservedAt?.isCharging) ?? receivedAt,
      });
    }

    this.logger.debug(
      `Battery observation classify ingested vehicle=${payload.vehicleId} key=${payload.idempotencyKey}`,
    );
  }
}
