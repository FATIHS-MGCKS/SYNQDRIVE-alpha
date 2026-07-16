import { Injectable, Logger } from '@nestjs/common';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  buildHvCapacityObservationIdempotencyKey,
  HvCapacityObservationRepository,
} from './hv-capacity-observation.repository';
import { HvCapacityM2SampleProviderService } from './hv-capacity-m2-sample-provider.service';
import { HvCapacityM3ValidationService } from './hv-capacity-m3-validation.service';
import { HvCapacitySessionSummaryService } from './hv-capacity-session-summary.service';
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
  type HvCapacityM2PointEstimate,
  type HvCapacityM2SessionResult,
} from './hv-capacity-m2.types';
import type { HvCapacitySessionSummaryInputObservation } from './hv-capacity-session-summary.types';
import type { HvCapacityM3ValidationResult } from './hv-capacity-m3.types';
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
    private readonly sessionSummary: HvCapacitySessionSummaryService,
    private readonly m3Validation: HvCapacityM3ValidationService,
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

    let estimates: HvCapacityM2PointEstimate[] = [];
    let persistedCount = 0;
    let skippedCount = 0;
    let sessionMedianKwh: number | null = null;
    let summaryObservations: HvCapacitySessionSummaryInputObservation[] | undefined;

    if (!alreadyProcessed) {
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

      estimates = buildHvM2PointEstimates({
        samples,
        capacityBand,
      });
      sessionMedianKwh = medianHvM2Estimates(estimates);

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

      skippedCount = Math.max(0, samples.length - persistedCount);
      summaryObservations = estimates.map((estimate) => ({
        observedAt: estimate.sample.observedAt,
        estimatedCapacityKwh: estimate.valueKwh,
        socPercent: estimate.sample.socPercent,
        preferredSocBand: estimate.gate.preferredSocBand,
        outlier: estimate.outlier,
        quality: resolveHvM2ObservationQuality(estimate),
      }));

      if (persistedCount > 0) {
        this.logger.debug(
          `M2 shadow persisted ${persistedCount} observations session=${session.id} median=${sessionMedianKwh?.toFixed(2) ?? 'n/a'} kWh`,
        );
      } else if (samples.length === 0) {
        this.logger.debug(
          `M2 shadow no samples session=${session.id} reason=${HV_M2_GATE_REASONS.MISSING_ENERGY}`,
        );
      }
    } else {
      this.logger.debug(
        `M2 shadow observations already present — aggregating summary session=${session.id}`,
      );
    }

    const summary = await this.sessionSummary.summarizeSession({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: session.id,
      observationsOverride: summaryObservations,
    });

    if (summary) {
      this.logger.debug(
        `M2 session summary session=${session.id} status=${summary.status} median=${summary.stats.medianCapacityKwh?.toFixed(2) ?? 'n/a'} cv=${summary.stats.coefficientOfVariation?.toFixed(4) ?? 'n/a'}`,
      );
    }

    const m3Result = await this.m3Validation.validateSession({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      chargeSessionId: session.id,
      m2MedianCapacityKwh: summary?.stats.medianCapacityKwh ?? sessionMedianKwh,
    });

    if (m3Result.persisted) {
      this.logger.debug(
        `M3 validation session=${session.id} capacity=${m3Result.estimate?.estimatedCapacityKwh.toFixed(2) ?? 'n/a'} kWh conflict=${m3Result.estimate?.methodConflict ?? false}`,
      );
    }

    return {
      sessionId: session.id,
      method: HV_M2_CAPACITY_METHOD,
      modelVersion: HV_M2_MODEL_VERSION,
      estimates,
      sessionMedianKwh: summary?.stats.medianCapacityKwh ?? sessionMedianKwh,
      persistedCount,
      skippedCount,
      summary,
      m3Validation: m3Result,
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
      summary: null,
      m3Validation: null,
    };
  }
}
