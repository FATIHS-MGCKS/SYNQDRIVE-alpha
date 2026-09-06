import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { runTripObservabilitySafely } from '@modules/vehicle-intelligence/trips/trip-fsm-observability-safe.util';
import {
  loadSnapshotPollingTierConfig,
  type SnapshotPollingTierConfig,
} from '../schedulers/snapshot-polling/snapshot-polling-tier.config';
import {
  buildSnapshotWakeContext,
  mergePendingWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  wakeAlreadyCoveredBySnapshot,
  wakeProbeDelayMs,
  shouldRequestWakeProbe,
} from './snapshot-wake.util';
import {
  enqueueStableSnapshotJob,
  snapshotQueueNeedsPendingWake,
} from './snapshot-wake-queue.util';
import type {
  DimoSnapshotJobData,
  PendingSnapshotWakeRecord,
  RequestSnapshotInput,
  SnapshotWakeContext,
  SnapshotWakeOutcome,
} from './snapshot-wake.types';

const PENDING_WAKE_TTL_SEC = 3600;

export interface AfterSnapshotJobParams {
  vehicleId: string;
  dimoTokenId: number;
  jobData: DimoSnapshotJobData;
  snapshotSourceTimestamp: Date | null;
  staleMonotonicSkipped: boolean;
  tripStartEvalError: boolean;
  possibleStartCreated: boolean;
  providerFetchFailed: boolean;
  fsmState: TripDetectionState | null;
}

@Injectable()
export class SnapshotWakeCoordinatorService {
  private readonly logger = new Logger(SnapshotWakeCoordinatorService.name);
  private readonly tierConfig: SnapshotPollingTierConfig =
    loadSnapshotPollingTierConfig();

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly queue: Queue,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async requestSnapshot(input: RequestSnapshotInput): Promise<SnapshotWakeOutcome> {
    const jobId = snapshotJobId(input.vehicleId);
    const data: DimoSnapshotJobData = {
      vehicleId: input.vehicleId,
      dimoTokenId: input.dimoTokenId,
      origin: input.origin,
      wakeContext: input.wakeContext,
    };

    try {
      const enqueueOutcome = await enqueueStableSnapshotJob({
        queue: this.queue,
        jobName: 'snapshot',
        jobId,
        data,
        delayMs: input.delayMs,
      });

      if (
        snapshotQueueNeedsPendingWake(enqueueOutcome) &&
        input.wakeContext
      ) {
        await this.savePendingWake(
          input.vehicleId,
          input.dimoTokenId,
          input.wakeContext,
        );
        this.recordWakeMetric(input.wakeContext, 'COALESCED');
        return 'COALESCED';
      }

      if (enqueueOutcome === 'ENQUEUED' || enqueueOutcome === 'RECOVERED_TERMINAL') {
        if (input.wakeContext) {
          this.recordWakeMetric(
            input.wakeContext,
            enqueueOutcome === 'RECOVERED_TERMINAL' ? 'ENQUEUED' : 'ENQUEUED',
          );
        }
        return 'ENQUEUED';
      }

      return 'COALESCED';
    } catch (err: unknown) {
      this.logger.warn(
        `Snapshot wake enqueue failed for ${input.vehicleId}: ${(err as Error).message}`,
      );
      if (input.wakeContext) {
        this.recordWakeMetric(input.wakeContext, 'QUEUE_FAILED');
      }
      return 'QUEUE_FAILED';
    }
  }

  async loadPendingWake(
    vehicleId: string,
  ): Promise<PendingSnapshotWakeRecord | null> {
    try {
      const raw = await this.redis.get(pendingWakeRedisKey(vehicleId));
      if (!raw) return null;
      return JSON.parse(raw) as PendingSnapshotWakeRecord;
    } catch (err) {
      this.logger.debug(
        `Pending wake read failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async clearPendingWake(vehicleId: string): Promise<void> {
    try {
      await this.redis.del(pendingWakeRedisKey(vehicleId));
    } catch {
      // non-blocking
    }
  }

  async savePendingWake(
    vehicleId: string,
    dimoTokenId: number,
    wakeContext: SnapshotWakeContext,
  ): Promise<void> {
    try {
      const existing = await this.loadPendingWake(vehicleId);
      const merged = mergePendingWakeContext(
        existing?.wakeContext,
        wakeContext,
      );
      const record: PendingSnapshotWakeRecord = {
        dimoTokenId,
        wakeContext: merged,
        updatedAtMs: Date.now(),
      };
      await this.redis.set(
        pendingWakeRedisKey(vehicleId),
        JSON.stringify(record),
        'EX',
        PENDING_WAKE_TTL_SEC,
      );
    } catch (err) {
      this.logger.warn(
        `Pending wake save failed for ${vehicleId}: ${(err as Error).message}`,
      );
    }
  }

  async consumePendingWake(
    vehicleId: string,
  ): Promise<PendingSnapshotWakeRecord | null> {
    const pending = await this.loadPendingWake(vehicleId);
    if (pending) {
      await this.clearPendingWake(vehicleId);
    }
    return pending;
  }

  resolveEffectiveWakeContext(
    jobData: DimoSnapshotJobData,
    pending: PendingSnapshotWakeRecord | null,
  ): SnapshotWakeContext | undefined {
    if (!jobData.wakeContext && !pending?.wakeContext) {
      return undefined;
    }
    if (!jobData.wakeContext) {
      return pending?.wakeContext;
    }
    if (!pending?.wakeContext) {
      return jobData.wakeContext;
    }
    return mergePendingWakeContext(jobData.wakeContext, pending.wakeContext);
  }

  async afterSnapshotJob(params: AfterSnapshotJobParams): Promise<void> {
    const pending = await this.consumePendingWake(params.vehicleId);
    const effectiveWake = this.resolveEffectiveWakeContext(
      params.jobData,
      pending,
    );

    if (
      effectiveWake &&
      wakeAlreadyCoveredBySnapshot({
        wakeContext: effectiveWake,
        snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      })
    ) {
      if (pending) {
        this.recordWakeMetric(effectiveWake, 'ALREADY_COVERED');
      }
      return;
    }

    const probeEligible = shouldRequestWakeProbe({
      origin: params.jobData.origin,
      wakeContext: effectiveWake,
      snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      staleMonotonicSkipped: params.staleMonotonicSkipped,
      tripStartEvalError: params.tripStartEvalError,
      possibleStartCreated: params.possibleStartCreated,
      providerFetchFailed: params.providerFetchFailed,
      fsmState: params.fsmState,
    });

    if (pending && !probeEligible) {
      const pendingOutcome = await this.requestSnapshot({
        vehicleId: params.vehicleId,
        dimoTokenId: pending.dimoTokenId,
        origin: 'PROVIDER_WAKE',
        wakeContext: pending.wakeContext,
      });
      if (pendingOutcome === 'QUEUE_FAILED') {
        await this.savePendingWake(
          params.vehicleId,
          pending.dimoTokenId,
          pending.wakeContext,
        );
      }
      return;
    }

    if (!probeEligible) {
      return;
    }

    if (!effectiveWake || effectiveWake.probeGeneration === 1) {
      return;
    }

    const eligible = await this.isVehicleSnapshotEligible(params.vehicleId);
    if (!eligible) {
      return;
    }

    const probeContext = buildSnapshotWakeContext({
      reason: effectiveWake.reason,
      signalName: effectiveWake.signalName,
      providerObservedAt: effectiveWake.providerObservedAt
        ? new Date(effectiveWake.providerObservedAt)
        : null,
      receivedAt: new Date(effectiveWake.receivedAt),
      probeGeneration: 1,
    });

    const probeOutcome = await this.requestSnapshot({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      origin: 'WAKE_PROBE',
      wakeContext: probeContext,
      delayMs: wakeProbeDelayMs(this.tierConfig),
    });

    runTripObservabilitySafely(this.logger, 'wake_probe_schedule', () => {
      this.tripMetrics?.snapshotWakeProbeTotal.inc({
        reason: effectiveWake.reason,
        outcome:
          probeOutcome === 'ENQUEUED'
            ? 'SCHEDULED'
            : probeOutcome === 'COALESCED'
              ? 'COALESCED'
              : 'QUEUE_FAILED',
      });
    });
  }

  async isVehicleSnapshotEligible(vehicleId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        status: true,
        dimoVehicle: { select: { connectionStatus: true, tokenId: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) return false;
    if (vehicle.dimoVehicle.connectionStatus !== 'CONNECTED') return false;
    return (
      vehicle.status === VehicleStatus.AVAILABLE ||
      vehicle.status === VehicleStatus.RENTED
    );
  }

  async isRestingForPrimaryWake(vehicleId: string): Promise<boolean> {
    const det = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { state: true },
    });
    return det?.state === TripDetectionState.RESTING;
  }

  recordWakeMetric(
    wakeContext: SnapshotWakeContext,
    outcome: SnapshotWakeOutcome,
  ): void {
    runTripObservabilitySafely(this.logger, 'snapshot_wake_total', () => {
      this.tripMetrics?.snapshotWakeTotal.inc({
        source: wakeContext.source,
        reason: wakeContext.reason,
        outcome,
      });
    });
  }

  observeWakeToFetchSeconds(
    wakeContext: SnapshotWakeContext | undefined,
    snapshotFetchedAt: Date,
  ): void {
    if (!wakeContext?.providerObservedAt) return;
    const observedAt = new Date(wakeContext.providerObservedAt);
    if (!Number.isFinite(observedAt.getTime())) return;
    const deltaSec =
      (snapshotFetchedAt.getTime() - observedAt.getTime()) / 1000;
    if (deltaSec < 0) return;
    runTripObservabilitySafely(this.logger, 'wake_to_fetch_latency', () => {
      this.tripMetrics?.snapshotWakeToFetchSeconds.observe(deltaSec);
    });
  }
}
