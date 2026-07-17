import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2HvFallbackChargeSessionEnabled, isBatteryV2HvRechargeSessionEnabled } from '@config/battery-health-v2.config';
import type { HvBatterySignalObservedAt } from '../../../dimo/mappers/dimo-battery-signal.mapper';
import { BatteryV2Service } from '../battery-v2.service';
import { HvFallbackChargeSessionDetectorService } from '../hv-charge-session/hv-fallback-charge-session-detector.service';
import { HvRechargeSessionReconcileProducerService } from '../hv-charge-session/hv-recharge-session-reconcile-producer.service';
import { HvMethodProfileService } from '../hv-method-profile/hv-method-profile.service';
import { HvBatteryHealthService } from '../hv-battery-health.service';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2JobDeadLetterService } from './battery-v2-job-dead-letter.service';
import { BatteryV2ProviderError } from './battery-v2-job.errors';
import { buildAssessmentJobIdempotencyKey } from './battery-v2-job-idempotency.policy';
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
    private readonly hvMethodProfile: HvMethodProfileService,
    private readonly fallbackDetector: HvFallbackChargeSessionDetectorService,
    private readonly jobProducer: BatteryV2JobProducerService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
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
      const capture = await this.batteryV2.onSnapshot(
        payload.vehicleId,
        ctx.lvBatteryVoltage,
        parseIso(ctx.lvBatteryObservedAt) ?? null,
      );
      if (capture.restCaptured && capture.capturedAt) {
        await this.enqueueLvAssessmentRecompute({
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          inputVersion: capture.capturedAt.getTime(),
        });
      }
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
      const profile = await this.hvMethodProfile.resolveForVehicle({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
      });

      if (profile.rechargeSegmentsAvailable) {
        await this.rechargeReconcileProducer.enqueueForChargingTransition({
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          isCharging: ctx.tractionBatteryIsCharging,
          observedAt: parseIso(ctx.signalObservedAt?.isCharging) ?? receivedAt,
        });
      } else if (isBatteryV2HvFallbackChargeSessionEnabled()) {
        await this.fallbackDetector.detectAndPersistForVehicle({
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          correlationId: `hv-fallback:charging:${payload.vehicleId}`,
        });
      }
    }

    this.logger.debug(
      `Battery observation classify ingested vehicle=${payload.vehicleId} key=${payload.idempotencyKey}`,
    );
  }

  private async enqueueLvAssessmentRecompute(input: {
    organizationId: string;
    vehicleId: string;
    inputVersion: number;
  }): Promise<void> {
    const idempotencyKey = buildAssessmentJobIdempotencyKey({
      vehicleId: input.vehicleId,
      assessmentType: 'LV_HEALTH',
      inputVersion: input.inputVersion,
    });
    if (
      await this.deadLetters.isDeadLetter(
        'BATTERY_ASSESSMENT_RECOMPUTE',
        idempotencyKey,
      )
    ) {
      return;
    }

    const jobId = await this.jobProducer.enqueue('BATTERY_ASSESSMENT_RECOMPUTE', {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey,
      assessmentType: 'LV_HEALTH',
      inputVersion: input.inputVersion,
      correlationId: `snapshot-rest:${input.vehicleId}:${input.inputVersion}`,
    });

    if (jobId) {
      this.logger.debug(
        `Enqueued LV assessment recompute after rest capture vehicle=${input.vehicleId} job=${jobId}`,
      );
    }
  }
}
