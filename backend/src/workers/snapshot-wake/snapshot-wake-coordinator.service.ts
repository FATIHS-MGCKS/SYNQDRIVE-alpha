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
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import {
  ACK_PENDING_WAKE_SCRIPT,
  ACK_SUCCESSOR_HANDOFF_SCRIPT,
  ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
  ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
} from './snapshot-wake-redis.scripts';
import type {
  ClaimedPendingSnapshotWake,
  DimoSnapshotJobData,
  PendingSnapshotWakeRecord,
  PendingWakePersistResult,
  RequestSnapshotInput,
  SnapshotWakeContext,
  SnapshotWakeOutcome,
  SuccessorHandoffPersistResult,
  SuccessorSnapshotWakeRecord,
} from './snapshot-wake.types';

const PENDING_WAKE_TTL_SEC = 3600;
const SUCCESSOR_WAKE_TTL_SEC = 3600;

const HANDOFF_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: { count: 50, age: 3600 },
  attempts: 100,
  backoff: { type: 'fixed' as const, delay: 1000 },
};

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
    if (input.wakeContext) {
      const persist = await this.persistPendingWakeAtomic(
        input.vehicleId,
        input.dimoTokenId,
        input.wakeContext,
      );
      if (!persist.ok) {
        this.recordWakeMetric(input.wakeContext, 'QUEUE_FAILED');
        return 'QUEUE_FAILED';
      }
    }

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

  async persistPendingWakeAtomic(
    vehicleId: string,
    dimoTokenId: number,
    wakeContext: SnapshotWakeContext,
  ): Promise<PendingWakePersistResult> {
    try {
      const raw = await this.redis.eval(
        ATOMIC_PENDING_WAKE_MERGE_SCRIPT,
        1,
        pendingWakeRedisKey(vehicleId),
        JSON.stringify(wakeContext),
        String(dimoTokenId),
        String(Date.now()),
        String(PENDING_WAKE_TTL_SEC),
      );
      if (typeof raw !== 'string') {
        return { ok: false, error: 'invalid_redis_response' };
      }
      const parsed = JSON.parse(raw) as { ok?: boolean; version?: number };
      if (!parsed.ok || typeof parsed.version !== 'number') {
        return { ok: false, error: 'merge_failed' };
      }
      return { ok: true, version: parsed.version };
    } catch (err) {
      this.logger.warn(
        `Pending wake atomic persist failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return { ok: false, error: (err as Error).message };
    }
  }

  /** @deprecated Use persistPendingWakeAtomic — retained for tests migrating to atomic API. */
  async savePendingWake(
    vehicleId: string,
    dimoTokenId: number,
    wakeContext: SnapshotWakeContext,
  ): Promise<PendingWakePersistResult> {
    return this.persistPendingWakeAtomic(vehicleId, dimoTokenId, wakeContext);
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
        const acked = await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
        if (!acked) {
          await this.reconcileOutstandingPendingWake(params.vehicleId);
        }
        this.recordWakeMetric(effectiveWake, 'ALREADY_COVERED');
      } else {
        await this.reconcileOutstandingPendingWake(params.vehicleId);
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
        const acked = await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
        if (!acked) {
          await this.reconcileOutstandingPendingWake(params.vehicleId);
        }
      }
      return;
    }

    if (!probeEligible) {
      await this.reconcileOutstandingPendingWake(params.vehicleId);
      return;
    }

    if (!effectiveWake || effectiveWake.probeGeneration === 1) {
      if (params.claimedPendingWake) {
        const acked = await this.acknowledgePendingWake(
          params.vehicleId,
          params.claimedPendingWake.version,
        );
        if (!acked) {
          await this.reconcileOutstandingPendingWake(params.vehicleId);
        }
      } else {
        await this.reconcileOutstandingPendingWake(params.vehicleId);
      }
      return;
    }

    const eligible = await this.isVehicleSnapshotEligible(params.vehicleId);
    if (!eligible) {
      await this.reconcileOutstandingPendingWake(params.vehicleId);
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
      const acked = await this.acknowledgePendingWake(
        params.vehicleId,
        params.claimedPendingWake.version,
      );
      if (!acked) {
        await this.reconcileOutstandingPendingWake(params.vehicleId);
      }
    } else if (handoffOutcome === 'QUEUE_FAILED') {
      await this.reconcileOutstandingPendingWake(params.vehicleId);
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

  async reconcileOutstandingPendingWake(vehicleId: string): Promise<void> {
    const latest = await this.loadPendingWake(vehicleId);
    if (!latest) {
      return;
    }
    await this.scheduleDurableSuccessor({
      vehicleId,
      dimoTokenId: latest.dimoTokenId,
      origin: 'PROVIDER_WAKE',
      wakeContext: latest.wakeContext,
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
    const persist = await this.persistSuccessorHandoffAtomic({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      origin: params.origin ?? 'PROVIDER_WAKE',
      wakeContext: params.wakeContext,
      notBeforeMs,
    });
    if (!persist.ok || persist.notBeforeMs == null) {
      return 'QUEUE_FAILED';
    }
    try {
      await this.enqueueHandoffJob(params.vehicleId, persist.notBeforeMs);
      return 'HANDOFF_SCHEDULED';
    } catch (err) {
      this.logger.warn(
        `Successor handoff enqueue failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return 'QUEUE_FAILED';
    }
  }

  async persistSuccessorHandoffAtomic(params: {
    vehicleId: string;
    dimoTokenId: number;
    origin: NonNullable<DimoSnapshotJobData['origin']>;
    wakeContext: SnapshotWakeContext;
    notBeforeMs: number;
  }): Promise<SuccessorHandoffPersistResult> {
    try {
      const payload = JSON.stringify({
        dimoTokenId: params.dimoTokenId,
        origin: params.origin,
        wakeContext: params.wakeContext,
        notBeforeMs: params.notBeforeMs,
      });
      const raw = await this.redis.eval(
        ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT,
        1,
        successorWakeRedisKey(params.vehicleId),
        payload,
        String(Date.now()),
        String(SUCCESSOR_WAKE_TTL_SEC),
      );
      if (typeof raw !== 'string') {
        return { ok: false, error: 'invalid_redis_response' };
      }
      const parsed = JSON.parse(raw) as {
        ok?: boolean;
        version?: number;
        notBeforeMs?: number;
      };
      if (!parsed.ok || typeof parsed.version !== 'number') {
        return { ok: false, error: 'merge_failed' };
      }
      return {
        ok: true,
        version: parsed.version,
        notBeforeMs: parsed.notBeforeMs ?? params.notBeforeMs,
      };
    } catch (err) {
      this.logger.warn(
        `Successor handoff persist failed for ${params.vehicleId}: ${(err as Error).message}`,
      );
      return { ok: false, error: (err as Error).message };
    }
  }

  async loadSuccessorHandoff(
    vehicleId: string,
  ): Promise<SuccessorSnapshotWakeRecord | null> {
    try {
      const raw = await this.redis.get(successorWakeRedisKey(vehicleId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SuccessorSnapshotWakeRecord;
      if (typeof parsed.version !== 'number') {
        parsed.version = 1;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async acknowledgeSuccessorHandoff(
    vehicleId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        ACK_SUCCESSOR_HANDOFF_SCRIPT,
        1,
        successorWakeRedisKey(vehicleId),
        String(expectedVersion),
      );
      return Number(result) === 1;
    } catch (err) {
      this.logger.warn(
        `Successor handoff ACK failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async enqueueHandoffJob(vehicleId: string, notBeforeMs: number): Promise<void> {
    const delayMs = Math.max(0, notBeforeMs - Date.now());
    const jobId = snapshotWakeHandoffJobId(vehicleId);
    const existing = await this.handoffQueue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();
      if (state === 'active') {
        return;
      }
      if (state === 'waiting' || state === 'delayed') {
        const existingDelay = existing.opts.delay ?? 0;
        if (delayMs < existingDelay) {
          await existing.changeDelay(delayMs);
        }
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
        ...HANDOFF_JOB_OPTIONS,
      },
    );
  }

  /**
   * Post-terminal successor dispatch. Never performs a provider fetch — only
   * enqueues the canonical serialized snapshot path when safe.
   *
   * Defers via SnapshotWakeHandoffDeferError so BullMQ re-arms the CURRENT
   * handoff job instead of self-coalescing duplicate stable jobIds.
   */
  async dispatchSuccessorHandoff(vehicleId: string): Promise<void> {
    const successor = await this.loadSuccessorHandoff(vehicleId);
    if (!successor) {
      return;
    }

    const loadedVersion = successor.version;
    const now = Date.now();

    if (now < successor.notBeforeMs) {
      throw new SnapshotWakeHandoffDeferError(
        successor.notBeforeMs - now,
        'not_before',
      );
    }

    const canonicalJob = await this.queue.getJob(snapshotJobId(vehicleId));
    if (canonicalJob) {
      const state = await canonicalJob.getState();
      if (isActiveQueueState(state) || isQueuedQueueState(state)) {
        throw new SnapshotWakeHandoffDeferError(1000, 'canonical_active');
      }
    }

    let outcome: SnapshotWakeOutcome;
    try {
      outcome = await this.requestSnapshot({
        vehicleId,
        dimoTokenId: successor.dimoTokenId,
        origin: successor.origin,
        wakeContext: successor.wakeContext,
      });
    } catch (err) {
      this.logger.warn(
        `Successor canonical enqueue threw for ${vehicleId}: ${(err as Error).message}`,
      );
      throw new SnapshotWakeHandoffDeferError(5000, 'enqueue_failed');
    }

    if (outcome === 'ENQUEUED' || outcome === 'COALESCED') {
      await this.acknowledgeSuccessorHandoff(vehicleId, loadedVersion);
      return;
    }

    throw new SnapshotWakeHandoffDeferError(5000, 'queue_failed');
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
