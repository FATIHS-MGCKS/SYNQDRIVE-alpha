import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  buildHvCapacityObservationIdempotencyKey,
  HvCapacityObservationRepository,
} from './hv-capacity-observation.repository';
import { HvCapacityM2SampleProviderService } from './hv-capacity-m2-sample-provider.service';
import {
  buildHvM2PointEstimates,
  medianHvM2Estimates,
  resolveHvM2CapacityBand,
  resolveHvM2ObservationQuality,
} from './hv-capacity-m2.policy';
import {
  HV_M2_CAPACITY_METHOD,
  HV_M2_GATE_REASONS,
  HV_M2_MODEL_VERSION,
  type HvCapacityM2Sample,
  type HvCapacityM2SessionResult,
} from './hv-capacity-m2.types';
import { withHvCapacityShadowMetadata } from './hv-capacity-shadow.policy';

export interface RecomputeHvM2ShadowInput {
  organizationId: string;
  vehicleId: string;
  chargeSessionId: string;
  correlationId?: string | null;
  /** Test hook — inject samples without DB snapshots. */
  samplesOverride?: HvCapacityM2Sample[];
}

@Injectable()
export class HvCapacityShadowService {
  private readonly logger = new Logger(HvCapacityShadowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sampleProvider: HvCapacityM2SampleProviderService,
    private readonly observations: HvCapacityObservationRepository,
  ) {}

  async recomputeM2ForSession(
    input: RecomputeHvM2ShadowInput,
  ): Promise<HvCapacityM2SessionResult> {
    if (!isBatteryV2HvCapacityShadowEnabled()) {
      return this.emptyResult(input.chargeSessionId);
    }

    const session = await this.prisma.hvChargeSession.findFirst({
      where: {
        id: input.chargeSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });

    if (!session) {
      this.logger.debug(
        `M2 shadow skipped — session not found id=${input.chargeSessionId}`,
      );
      return this.emptyResult(input.chargeSessionId);
    }

    const metadata = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
    if (metadata.capacityShadowEligible !== true) {
      this.logger.debug(
        `M2 shadow skipped — session not eligible id=${session.id} status=${metadata.qualityStatus ?? 'unknown'}`,
      );
      return this.emptyResult(session.id);
    }

    if (session.isOngoing) {
      this.logger.debug(`M2 shadow skipped — session ongoing id=${session.id}`);
      return this.emptyResult(session.id);
    }

    const alreadyProcessed = await this.observations.hasSessionObservations({
      chargeSessionId: session.id,
      method: HV_M2_CAPACITY_METHOD,
      modelVersion: HV_M2_MODEL_VERSION,
    });
    if (alreadyProcessed) {
      this.logger.debug(`M2 shadow skipped — already processed id=${session.id}`);
      return this.emptyResult(session.id);
    }

    const reference = await this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        isActive: true,
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { capacityKwh: true },
    });

    const capacityBand = resolveHvM2CapacityBand({
      referenceCapacityKwh: reference?.capacityKwh ?? null,
    });

    const samples =
      input.samplesOverride ??
      (await this.sampleProvider.loadSessionSamples({
        vehicleId: input.vehicleId,
        startAt: session.startAt,
        endAt: session.endAt,
      }));

    const estimates = buildHvM2PointEstimates({
      samples,
      capacityBand,
    });
    const sessionMedianKwh = medianHvM2Estimates(estimates);

    let persistedCount = 0;
    for (const estimate of estimates) {
      const quality = resolveHvM2ObservationQuality(estimate);
      await this.observations.createIdempotent({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        chargeSessionId: session.id,
        method: HV_M2_CAPACITY_METHOD,
        estimatedCapacityKwh: estimate.valueKwh,
        referenceCapacityKwh: capacityBand.referenceCapacityKwh,
        quality,
        modelVersion: HV_M2_MODEL_VERSION,
        observedAt: estimate.sample.observedAt,
        metadata: withHvCapacityShadowMetadata({
          socPercent: estimate.sample.socPercent,
          currentEnergyKwh: estimate.sample.currentEnergyKwh,
          timestampDeltaMs: estimate.gate.timestampDeltaMs,
          preferredSocBand: estimate.gate.preferredSocBand,
          outlier: estimate.outlier,
          gateReasonCodes: estimate.gate.reasonCodes,
          sessionMedianKwh,
        }),
        idempotencyKey: buildHvCapacityObservationIdempotencyKey({
          chargeSessionId: session.id,
          observedAt: estimate.sample.observedAt,
        }),
      });
      persistedCount += 1;
    }

    const skippedCount = Math.max(0, samples.length - persistedCount);
    if (persistedCount > 0) {
      this.logger.debug(
        `M2 shadow persisted ${persistedCount} observations session=${session.id} median=${sessionMedianKwh?.toFixed(2) ?? 'n/a'} kWh`,
      );
    } else if (samples.length === 0) {
      this.logger.debug(
        `M2 shadow no samples session=${session.id} reason=${HV_M2_GATE_REASONS.MISSING_ENERGY}`,
      );
    }

    return {
      sessionId: session.id,
      method: HV_M2_CAPACITY_METHOD,
      modelVersion: HV_M2_MODEL_VERSION,
      estimates,
      sessionMedianKwh,
      persistedCount,
      skippedCount,
    };
  }

  private emptyResult(sessionId: string): HvCapacityM2SessionResult {
    return {
      sessionId,
      method: HV_M2_CAPACITY_METHOD,
      modelVersion: HV_M2_MODEL_VERSION,
      estimates: [],
      sessionMedianKwh: null,
      persistedCount: 0,
      skippedCount: 0,
    };
  }
}
