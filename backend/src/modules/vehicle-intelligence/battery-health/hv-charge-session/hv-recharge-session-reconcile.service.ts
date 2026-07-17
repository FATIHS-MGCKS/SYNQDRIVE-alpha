import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2HvRechargeSessionEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { HvMethodProfileService } from '../hv-method-profile/hv-method-profile.service';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';
import { HvFallbackChargeSessionDetectorService } from './hv-fallback-charge-session-detector.service';
import { HvChargeSessionIngestService } from './hv-charge-session-ingest.service';
import {
  buildHvRechargeRollingWindow,
  HV_RECHARGE_ROLLING_WINDOW_DAYS,
} from './hv-recharge-session-reconcile.policy';
import { recordHvRechargeReconcileMetrics } from './hv-recharge-session-reconcile.metrics';
import {
  HvRechargeSessionReconcileTrigger,
  type HvRechargeSessionReconcileTrigger as HvRechargeSessionReconcileTriggerType,
} from './hv-recharge-session-reconcile.trigger';
import type { HvChargeSessionIngestResult } from './hv-charge-session-ingest.service';

export interface HvRechargeSessionReconcileInput {
  organizationId: string;
  vehicleId: string;
  trigger?: HvRechargeSessionReconcileTriggerType;
  from?: Date;
  to?: Date;
  segmentFingerprint?: string | null;
  correlationId?: string | null;
}

export type HvRechargeSessionReconcileSkipReason =
  | 'disabled'
  | 'no_dimo_token'
  | 'capability_unavailable'
  | 'segment_not_found';

export interface HvRechargeSessionReconcileResult {
  skipped: boolean;
  skipReason?: HvRechargeSessionReconcileSkipReason;
  ingest?: HvChargeSessionIngestResult;
  fallback?: Awaited<
    ReturnType<HvFallbackChargeSessionDetectorService['detectAndPersistForVehicle']>
  >;
}

@Injectable()
export class HvRechargeSessionReconcileService {
  private readonly logger = new Logger(HvRechargeSessionReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hvMethodProfile: HvMethodProfileService,
    private readonly ingest: HvChargeSessionIngestService,
    private readonly fallbackDetector: HvFallbackChargeSessionDetectorService,
    private readonly metrics: TripMetricsService,
  ) {}

  async reconcile(input: HvRechargeSessionReconcileInput): Promise<HvRechargeSessionReconcileResult> {
    const trigger = input.trigger ?? HvRechargeSessionReconcileTrigger.PERIODIC;

    if (!isBatteryV2HvRechargeSessionEnabled()) {
      return { skipped: true, skipReason: 'disabled' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });

    if (!vehicle?.dimoVehicle?.tokenId) {
      return { skipped: true, skipReason: 'no_dimo_token' };
    }

    const profile = await this.hvMethodProfile.resolveForVehicle({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });

    if (!profile.rechargeSegmentsAvailable) {
      this.logger.debug(
        `HV recharge reconcile segments unavailable — attempting fallback vehicle=${input.vehicleId}`,
      );
      const window = input.from && input.to
        ? { from: input.from, to: input.to }
        : buildHvRechargeRollingWindow(input.to);
      const fallback = await this.fallbackDetector.detectAndPersistForVehicle({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        from: window.from,
        to: window.to,
        correlationId: input.correlationId,
      });
      return {
        skipped: fallback.skipped,
        skipReason: 'capability_unavailable',
        fallback,
      };
    }

    const window = input.from && input.to
      ? { from: input.from, to: input.to }
      : buildHvRechargeRollingWindow(input.to);

    try {
      if (input.segmentFingerprint) {
        const single = await this.ingest.ingestSegmentByFingerprint({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          segmentFingerprint: input.segmentFingerprint,
          correlationId: input.correlationId,
        });

        if (!single) {
          recordHvRechargeReconcileMetrics(this.metrics, {
            trigger,
            segmentsFetched: 0,
            created: 0,
            updated: 0,
            unchanged: 0,
            errorCode: 'segment_not_found',
          });
          return { skipped: true, skipReason: 'segment_not_found' };
        }

        const ingest: HvChargeSessionIngestResult = {
          fetched: 1,
          created: single.created ? 1 : 0,
          updated: !single.created && single.changed ? 1 : 0,
          unchanged: !single.created && !single.changed ? 1 : 0,
          results: [single],
        };

        this.recordSuccess(trigger, ingest, window.to);
        return { skipped: false, ingest };
      }

      const ingest = await this.ingest.ingestForVehicle({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        from: window.from,
        to: window.to,
        correlationId: input.correlationId,
      });

      if (!ingest) {
        return { skipped: true, skipReason: 'no_dimo_token' };
      }

      this.recordSuccess(trigger, ingest, window.to);
      return { skipped: false, ingest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordHvRechargeReconcileMetrics(this.metrics, {
        trigger,
        segmentsFetched: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        errorCode: 'provider_error',
      });
      this.logger.warn(
        `HV recharge reconcile failed vehicle=${input.vehicleId} trigger=${trigger}: ${message}`,
      );
      throw new BatteryV2ProviderError(message, {
        retryable: true,
        jobType: 'HV_RECHARGE_SESSION_RECONCILE',
      });
    }
  }

  private recordSuccess(
    trigger: HvRechargeSessionReconcileTriggerType,
    ingest: HvChargeSessionIngestResult,
    reconciledAt: Date,
  ): void {
    const latestEndMs = ingest.results
      .map((row) => row.session.endAt?.getTime() ?? row.session.startAt.getTime())
      .filter((value): value is number => Number.isFinite(value));
    const providerDelaySeconds =
      latestEndMs.length > 0
        ? Math.max(
            0,
            (reconciledAt.getTime() - Math.max(...latestEndMs)) / 1000,
          )
        : null;

    recordHvRechargeReconcileMetrics(this.metrics, {
      trigger,
      segmentsFetched: ingest.fetched,
      created: ingest.created,
      updated: ingest.updated,
      unchanged: ingest.unchanged,
      providerDelaySeconds,
    });

    this.logger.debug(
      `HV recharge reconcile vehicle window=${HV_RECHARGE_ROLLING_WINDOW_DAYS}d fetched=${ingest.fetched} created=${ingest.created} updated=${ingest.updated} unchanged=${ingest.unchanged}`,
    );
  }
}
