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
  resolveEffectiveWakeOrigin,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
  wakeAlreadyCoveredBySnapshot,
  wakeProbeDelayMs,
  shouldRequestWakeProbe,
} from './snapshot-wake.util';
import {
  enqueueStableSnapshotJob,
  isActiveQueueState,
  isQueuedQueueState,
  snapshotQueueNeedsPendingWake,
} from './snapshot-wake-queue.util';
import type {
  ClaimedPendingSnapshotWake,
  DimoSnapshotJobData,
  PendingSnapshotWakeRecord,
  RequestSnapshotInput,
  SnapshotWakeContext,
  SnapshotWakeOutcome,
  SuccessorSnapshotWakeRecord,
} from './snapshot-wake.types';

const PENDING_WAKE_TTL_SEC = 3600;
const SUCCESSOR_WAKE_TTL_SEC = 3600;

const ACK_PENDING_WAKE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok then return 0 end
if tonumber(record.version) == tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;

export interface AfterSnapshotJobParams {
  vehicleId: string;
  dimoTokenId: number;
  jobData: DimoSnapshotJobData;
  claimedPendingWake: ClaimedPendingSnapshotWake | null;
  effectiveWakeContext: SnapshotWakeContext | undefined;
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
    @InjectQueue(QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF)
    private readonly handoffQueue: Queue,
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
          this.recordWakeMetric(input.wakeContext, 'ENQUEUED');
        }
        return 'ENQUEUED';
      }

      return 'COALESCED';
    } catch (err: unknown) {
      this.logger.warn(
        `Snapshot wake enqueue failed for ${input.vehicleId}: ${(err as Error).message}`,
      );
      if (input.wakeContext) {
        await this.savePendingWake(
          input.vehicleId,
          input.dimoTokenId,
          input.wakeContext,
        );
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
      const parsed = JSON.parse(raw) as PendingSnapshotWakeRecord;
      if (typeof parsed.version !== 'number') {
        parsed.version = 1;
      }
      return parsed;
    } catch (err) {
      this.logger.debug(
        `Pending wake read failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async claimPendingWakeForRun(
    vehicleId: string,
  ): Promise<ClaimedPendingSnapshotWake | null> {
    const record = await this.loadPendingWake(vehicleId);
    if (!record) return null;
    return { record, version: record.version };
  }

  async acknowledgePendingWake(
    vehicleId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        ACK_PENDING_WAKE_SCRIPT,
        1,
        pendingWakeRedisKey(vehicleId),
        String(expectedVersion),
      );
      return Number(result) === 1;
    } catch (err) {
      this.logger.warn(
        `Pending wake ACK failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return false;
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
        version: (existing?.version ?? 0) + 1,
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
    const effectiveWake = params.effectiveWakeContext;
    const effectiveOrigin = resolveEffectiveWakeOrigin(
      params.jobData.origin,
      effectiveWake,
    );

    if (
      effectiveWake &&
      wakeAlreadyCoveredBySnapshot({
        wakeContext: effectiveWake,
        snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      })
    ) {
      if (params.claimedPendingWake) {
        await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
        this.recordWakeMetric(effectiveWake, 'ALREADY_COVERED');
      }
      return;
    }

    const probeEligible = shouldRequestWakeProbe({
      origin: params.jobData.origin,
      effectiveWakeOrigin: effectiveOrigin,
      wakeContext: effectiveWake,
      snapshotSourceTimestamp: params.snapshotSourceTimestamp,
      staleMonotonicSkipped: params.staleMonotonicSkipped,
      tripStartEvalError: params.tripStartEvalError,
      possibleStartCreated: params.possibleStartCreated,
      providerFetchFailed: params.providerFetchFailed,
      fsmState: params.fsmState,
    });

    if (params.claimedPendingWake && !probeEligible) {
      const pending = params.claimedPendingWake.record;
      const handoffOutcome = await this.scheduleDurableSuccessor({
        vehicleId: params.vehicleId,
        dimoTokenId: pending.dimoTokenId,
        origin: 'PROVIDER_WAKE',
        wakeContext: pending.wakeContext,
      });
      if (handoffOutcome !== 'QUEUE_FAILED') {
        await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
      }
      return;
    }

    if (!probeEligible) {
      return;
    }

    if (!effectiveWake || effectiveWake.probeGeneration === 1) {
      if (params.claimedPendingWake) {
        await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
      }
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

    const handoffOutcome = await this.scheduleDurableSuccessor({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      origin: 'WAKE_PROBE',
      wakeContext: probeContext,
      delayMs: wakeProbeDelayMs(this.tierConfig),
    });

    if (params.claimedPendingWake && handoffOutcome !== 'QUEUE_FAILED') {
      await this.acknowledgePendingWake(
        params.vehicleId,
        params.claimedPendingWake.version,
      );
    }

    runTripObservabilitySafely(this.logger, 'wake_probe_schedule', () => {
      this.tripMetrics?.snapshotWakeProbeTotal.inc({
        reason: effectiveWake.reason,
        outcome:
          handoffOutcome === 'HANDOFF_SCHEDULED'
            ? 'SCHEDULED'
            : handoffOutcome === 'QUEUE_FAILED'
              ? 'QUEUE_FAILED'
              : 'COALESCED',
      });
    });
  }

  async scheduleDurableSuccessor(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: DimoSnapshotJobData['origin'];
    wakeContext: SnapshotWakeContext;
    delayMs?: number;
  }): Promise<'HANDOFF_SCHEDULED' | 'QUEUE_FAILED'> {
    const notBeforeMs = Date.now() + (params.delayMs ?? 0);
    try {
      await this.persistSuccessorHandoff({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        origin: params.origin ?? 'PROVIDER_WAKE',
        wakeContext: params.wakeContext,
        notBeforeMs,
      });
      await this.enqueueHandoffJob(params.vehicleId, notBeforeMs);
      return 'HANDOFF_SCHEDULED';
    } catch (err) {
      this.logger.warn(
        `Successor handoff schedule failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
  }

  async persistSuccessorHandoff(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: NonNullable<DimoSnapshotJobData['origin']>;
    wakeContext: SnapshotWakeContext;
    notBeforeMs: number;
  }): Promise<void> {
    const record: SuccessorSnapshotWakeRecord = {
      dimoTokenId: params.dimoTokenId,
      origin: params.origin,
      wakeContext: params.wakeContext,
      notBeforeMs: params.notBeforeMs,
      updatedAtMs: Date.now(),
    };
    await this.redis.set(
      successorWakeRedisKey(params.vehicleId),
      JSON.stringify(record),
      'EX',
      SUCCESSOR_WAKE_TTL_SEC,
    );
  }

  async loadSuccessorHandoff(
    vehicleId: string,
  ): Promise<SuccessorSnapshotWakeRecord | null> {
    try {
      const raw = await this.redis.get(successorWakeRedisKey(vehicleId));
      if (!raw) return null;
      return JSON.parse(raw) as SuccessorSnapshotWakeRecord;
    } catch {
      return null;
    }
  }

  async clearSuccessorHandoff(vehicleId: string): Promise<void> {
    try {
      await this.redis.del(successorWakeRedisKey(vehicleId));
    } catch {
      // non-blocking
    }
  }

  async enqueueHandoffJob(vehicleId: string, notBeforeMs: number): Promise<void> {
    const delayMs = Math.max(0, notBeforeMs - Date.now());
    const jobId = snapshotWakeHandoffJobId(vehicleId);
    const existing = await this.handoffQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active') {
        return;
      }
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }
    await this.handoffQueue.add(
      'dispatch',
      { vehicleId },
      {
        jobId,
        delay: delayMs > 0 ? delayMs : undefined,
        removeOnComplete: true,
        removeOnFail: { count: 20, age: 3600 },
      },
    );
  }

  /**
   * Post-terminal successor dispatch. Never performs a provider fetch — only
   * enqueues the canonical serialized snapshot path when safe.
   */
  async dispatchSuccessorHandoff(vehicleId: string): Promise<void> {
    const successor = await this.loadSuccessorHandoff(vehicleId);
    if (!successor) {
      return;
    }

    if (Date.now() < successor.notBeforeMs) {
      await this.enqueueHandoffJob(vehicleId, successor.notBeforeMs);
      return;
    }

    const canonicalJob = await this.queue.getJob(snapshotJobId(vehicleId));
    if (canonicalJob) {
      const state = await canonicalJob.getState();
      if (isActiveQueueState(state) || isQueuedQueueState(state)) {
        await this.enqueueHandoffJob(vehicleId, Date.now() + 1000);
        return;
      }
    }

    const outcome = await this.requestSnapshot({
      vehicleId,
      dimoTokenId: successor.dimoTokenId,
      origin: successor.origin,
      wakeContext: successor.wakeContext,
    });

    if (outcome === 'ENQUEUED' || outcome === 'COALESCED') {
      await this.clearSuccessorHandoff(vehicleId);
      return;
    }

    if (outcome === 'QUEUE_FAILED') {
      await this.savePendingWake(
        vehicleId,
        successor.dimoTokenId,
        successor.wakeContext,
      );
      await this.enqueueHandoffJob(vehicleId, Date.now() + 5000);
    }
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
