import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '@modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  applySnapshotPollingHysteresis,
  deriveSnapshotPollingTier,
  isSnapshotPollDue,
} from './snapshot-polling/derive-snapshot-polling-tier';
import { interleaveByOrganization } from './snapshot-polling/interleave-by-organization';
import { pruneVehiclePollingMemory } from './snapshot-polling/snapshot-polling-memory';
import {
  loadSnapshotPollingTierConfig,
  type SnapshotPollingTierConfig,
} from './snapshot-polling/snapshot-polling-tier.config';
import {
  SNAPSHOT_POLLABLE_TIERS,
  SnapshotPollingTier,
} from './snapshot-polling/snapshot-polling-tier.types';
import { evaluateFleetEnvelope } from './snapshot-polling/current-prod-fleet-envelope';
import { readWorkerConcurrency } from '@config/worker-concurrency.util';

/**
 * Enqueues DIMO snapshot poll jobs on a fixed 30 s cadence.
 *
 * Key invariant: per-vehicle jobs use `jobId = snapshot-<vehicleId>`, so that
 * if a previous tick left a job waiting/active, we never pile up duplicates.
 * To prevent a failed job from PERMANENTLY blocking the same jobId (BullMQ
 * deduplicates silently, and that previously caused specific vehicles to
 * stop being polled after a single DIMO 503 or a worker stall), every tick:
 *   1. unconditionally removes any existing job with that jobId (safe no-op
 *      if nothing is there; active jobs are skipped to preserve the lock)
 *   2. adds a fresh job with attempts+backoff from the global default.
 *
 * A separate low-frequency janitor wipes failed jobs older than a grace
 * window as a belt-and-suspenders guard against future anomalies.
 *
 * ─── P1.2 ACTIVITY-TIER POLLING ────────────────────────────────────────────
 * When `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true` (default), only
 * vehicles whose tier interval has elapsed since `providerFetchedAt` are
 * enqueued — with promotion bypass when authoritative activity signals move
 * a vehicle to a faster tier. Tier derivation is canonical via
 * `deriveSnapshotPollingTier`.
 *
 * Scheduler eligibility remains CONNECTED + tokenId (pre-P1.2 cohort).
 * OFFLINE recovery is owned by DimoVehicleSync (24h identity),
 * device-connection webhooks, and episode reconciliation — not snapshot polls.
 *
 * Roll back to legacy O(N) every-tick enqueue with
 * `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true`.
 *
 * ─── AUTO-BACKFILL-ON-RESUME GUARD ─────────────────────────────────────────
 * The scheduler also detects host-level suspensions (Windows sleep/hibernate,
 * laptop lid-close, process freeze, long GC stall, …). Because @Interval
 * re-arms from wall clock, a ~30 s tick that actually took ≫ 30 s is a hard
 * signal that the Node process was frozen for that duration and therefore
 * missed every DIMO poll / MQTT message in the gap. On the first tick after
 * resume we fire a one-shot reconciliation pass over [lastTickAt − buffer, now]
 * for every DIMO-connected vehicle, with DIMO-segment fallback enabled, so
 * that trips which happened during the freeze are recovered from canonical
 * segment data instead of being permanently missing.
 */
@Injectable()
export class DimoSnapshotScheduler {
  private readonly logger = new Logger(DimoSnapshotScheduler.name);

  /** Wall-clock timestamp of the last completed tick (null = first tick). */
  private lastTickAt: Date | null = null;

  /** Guards against overlapping backfill passes while one is still running. */
  private backfillInProgress = false;

  private readonly tierConfig: SnapshotPollingTierConfig =
    loadSnapshotPollingTierConfig();

  /** Per-vehicle hysteresis memory — repopulated each tick, survives between ticks. */
  private readonly vehiclePollingMemory = new Map<
    string,
    {
      effectiveTier: SnapshotPollingTier;
      lastActiveDrivingAtMs: number | null;
    }
  >();

  /**
   * Gap threshold above which we treat the tick delay as a host-level
   * suspension rather than normal jitter. Normal cadence is 30 s; a single
   * slow DB query or GC burst can push this to 1–2 min, so we only treat
   * > 3 min as "definitely missed work".
   */
  private static readonly SUSPEND_THRESHOLD_MS = 3 * 60_000;

  /**
   * Safety buffer subtracted from `lastTickAt` when building the backfill
   * window, to cover snapshots that might already have been in-flight when
   * the process was frozen.
   */
  private static readonly BACKFILL_LOOKBACK_BUFFER_MS = 2 * 60_000;

  /**
   * Hard cap on the backfill window. If the host was off for weeks we don't
   * want a single tick to fan out a 2-week reconciliation — the daily cold
   * tier in TripReconciliationScheduler already handles that gracefully.
   */
  private static readonly MAX_BACKFILL_WINDOW_MS = 24 * 3600_000;

  /** Log current-prod fleet envelope assessment once per process boot. */
  private fleetEnvelopeLogged = false;

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly reconciliation: TripReconciliationService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  @Interval(30000)
  async enqueueSnapshotJobs(): Promise<void> {
    if (!canEnqueueQueue(this.logger, 'dimo-snapshot')) return;
    const tickStartedAt = new Date();
    const nowMs = tickStartedAt.getTime();

    const previousTickAt = this.lastTickAt;
    if (previousTickAt !== null) {
      const gapMs = tickStartedAt.getTime() - previousTickAt.getTime();
      if (gapMs > DimoSnapshotScheduler.SUSPEND_THRESHOLD_MS) {
        this.logger.warn(
          `Resume-gap detected: tick delayed by ${Math.round(gapMs / 1000)}s ` +
            `(last tick at ${previousTickAt.toISOString()}, now ${tickStartedAt.toISOString()}). ` +
            `Scheduling one-shot trip backfill.`,
        );
        void this.runResumeBackfill(previousTickAt, tickStartedAt);
      }
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        dimoVehicleId: { not: null },
        status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.RENTED] },
        dimoVehicle: {
          connectionStatus: 'CONNECTED',
          tokenId: { not: null },
        },
      },
      include: {
        dimoVehicle: true,
        latestState: {
          select: {
            sourceTimestamp: true,
            lastSeenAt: true,
            providerFetchedAt: true,
            speedKmh: true,
            isIgnitionOn: true,
          },
        },
        tripDetectionState: {
          select: {
            state: true,
            lastActivityAt: true,
          },
        },
      },
    });

    if (!this.fleetEnvelopeLogged) {
      this.fleetEnvelopeLogged = true;
      const snapshotConcurrency = readWorkerConcurrency(
        'WORKER_SNAPSHOT_CONCURRENCY',
        5,
      );
      const evaluation = evaluateFleetEnvelope({
        connectedVehicleCount: vehicles.length,
        snapshotConcurrency,
      });
      if (evaluation.warnings.length > 0) {
        this.logger.warn(
          `Current-prod fleet envelope: ${evaluation.warnings.join('; ')}`,
        );
      } else {
        this.logger.log(
          `Current-prod fleet envelope OK: connected=${evaluation.connectedVehicleCount} ` +
            `snapshotConcurrency=${evaluation.snapshotConcurrency}`,
        );
      }
    }

    const useActivityTiers =
      this.tierConfig.activityTierPollingEnabled &&
      !this.tierConfig.legacyFixedCadence;

    const activeVehicleIds = new Set(vehicles.map((v) => v.id));
    pruneVehiclePollingMemory(this.vehiclePollingMemory, activeVehicleIds);

    const tierCounts = new Map<SnapshotPollingTier, number>();
    for (const tier of Object.values(SnapshotPollingTier)) {
      tierCounts.set(tier, 0);
    }

    type VehicleRow = (typeof vehicles)[number];
    const candidates: Array<{
      vehicle: VehicleRow;
      tokenId: number;
      effectiveTier: SnapshotPollingTier;
      rawTier: SnapshotPollingTier;
    }> = [];

    for (const v of vehicles) {
      const tokenId = v.dimoVehicle?.tokenId;
      if (tokenId == null) continue;

      const observationAt =
        v.latestState?.sourceTimestamp ?? v.latestState?.lastSeenAt ?? null;

      const tierInput = {
        connectionStatus: v.dimoVehicle?.connectionStatus ?? null,
        tokenId,
        tripDetectionState: v.tripDetectionState?.state ?? null,
        observationAt,
        lastActivityAt: v.tripDetectionState?.lastActivityAt ?? null,
        speedKmh: v.latestState?.speedKmh ?? null,
        isIgnitionOn: v.latestState?.isIgnitionOn ?? null,
        nowMs,
      };

      const { tier: rawTier } = deriveSnapshotPollingTier(
        tierInput,
        this.tierConfig,
      );

      tierCounts.set(rawTier, (tierCounts.get(rawTier) ?? 0) + 1);

      const memory = this.vehiclePollingMemory.get(v.id);
      const effectiveTier = useActivityTiers
        ? applySnapshotPollingHysteresis(
            {
              rawTier,
              previousEffectiveTier: memory?.effectiveTier ?? null,
              lastActiveDrivingAtMs:
                rawTier === SnapshotPollingTier.ACTIVE_DRIVING
                  ? nowMs
                  : memory?.lastActiveDrivingAtMs ?? null,
              nowMs,
            },
            this.tierConfig,
          )
        : SnapshotPollingTier.ACTIVE_DRIVING;

      this.vehiclePollingMemory.set(v.id, {
        effectiveTier,
        lastActiveDrivingAtMs:
          rawTier === SnapshotPollingTier.ACTIVE_DRIVING
            ? nowMs
            : memory?.lastActiveDrivingAtMs ?? null,
      });

      const due =
        !useActivityTiers ||
        isSnapshotPollDue({
          effectiveTier,
          lastPolledAt: v.latestState?.providerFetchedAt ?? null,
          nowMs,
          config: this.tierConfig,
          rawTier,
          previousEffectiveTier: memory?.effectiveTier ?? null,
          tierInput,
        });

      if (!due) continue;
      if (useActivityTiers && !SNAPSHOT_POLLABLE_TIERS.has(effectiveTier)) {
        continue;
      }

      candidates.push({ vehicle: v, tokenId, effectiveTier, rawTier });
    }

    const ordered = interleaveByOrganization(
      candidates.map((c) => ({
        ...c,
        organizationId: c.vehicle.organizationId,
      })),
    );

    const maxEnqueuePerTick =
      this.configService?.get<number>('worker.snapshotMaxEnqueuePerTick') ?? 0;
    const enqueueBatch =
      maxEnqueuePerTick > 0 ? ordered.slice(0, maxEnqueuePerTick) : ordered;
    const enqueueCapDeferred =
      maxEnqueuePerTick > 0 ? Math.max(0, ordered.length - enqueueBatch.length) : 0;

    let enqueued = 0;
    let recovered = 0;
    let skipped = 0;
    let notDue = useActivityTiers ? vehicles.length - ordered.length : 0;
    const enqueuedByTier = new Map<SnapshotPollingTier, number>();

    for (const { vehicle: v, tokenId, effectiveTier } of enqueueBatch) {
      const jobId = `snapshot-${v.id}`;

      try {
        const existing = await this.queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed' || state === 'completed') {
            await existing.remove();
            recovered += 1;
          }
        }
      } catch (err) {
        this.logger.debug(
          `getJob/remove for ${jobId} ignored: ${(err as Error).message}`,
        );
      }

      try {
        await this.queue.add(
          'snapshot',
          { vehicleId: v.id, dimoTokenId: tokenId },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: { count: 50, age: 3600 },
          },
        );
        enqueued += 1;
        enqueuedByTier.set(
          effectiveTier,
          (enqueuedByTier.get(effectiveTier) ?? 0) + 1,
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (msg.toLowerCase().includes('duplicate')) {
          skipped += 1;
        } else {
          this.logger.warn(`Failed to enqueue snapshot for ${v.id}: ${msg}`);
        }
      }
    }

    if (vehicles.length > 0) {
      const tierSummary = [...tierCounts.entries()]
        .filter(([, n]) => n > 0)
        .map(([tier, n]) => `${tier}=${n}`)
        .join(' ');

      const enqueueTierSummary = [...enqueuedByTier.entries()]
        .map(([tier, n]) => `${tier}=${n}`)
        .join(' ');

      this.logger.debug(
        `Snapshot tick: matched=${vehicles.length} enqueued=${enqueued} ` +
          `not_due=${notDue} recovered=${recovered} skipped_inflight=${skipped} ` +
          `enqueue_cap_deferred=${enqueueCapDeferred} ` +
          `activity_tier=${useActivityTiers} tiers{${tierSummary}} ` +
          (enqueueTierSummary ? `enqueued_tiers{${enqueueTierSummary}}` : ''),
      );

      if (recovered > 0) {
        this.logger.log(
          `Snapshot scheduler recovered ${recovered} vehicle(s) from stuck terminal-state jobs`,
        );
      }
    }

    this.lastTickAt = new Date();
  }

  /**
   * Hourly janitor: sweep any failed jobs older than 10 min out of Redis.
   */
  @Interval(60 * 60 * 1000)
  async sweepFailedJobs(): Promise<void> {
    try {
      const removed = await this.queue.clean(
        10 * 60 * 1000,
        100,
        'failed',
      );
      if (removed.length > 0) {
        this.logger.log(
          `Snapshot queue sweep: removed ${removed.length} stale failed job(s)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Snapshot queue sweep failed: ${(err as Error).message}`,
      );
    }
  }

  private async runResumeBackfill(
    previousTickAt: Date,
    now: Date,
  ): Promise<void> {
    if (this.backfillInProgress) {
      this.logger.debug('Resume backfill already in progress — skipping duplicate pass.');
      return;
    }
    this.backfillInProgress = true;

    try {
      const bufferedFrom = new Date(
        previousTickAt.getTime() - DimoSnapshotScheduler.BACKFILL_LOOKBACK_BUFFER_MS,
      );
      const cappedFrom = new Date(
        Math.max(
          bufferedFrom.getTime(),
          now.getTime() - DimoSnapshotScheduler.MAX_BACKFILL_WINDOW_MS,
        ),
      );

      const vehicles = await this.prisma.vehicle.findMany({
        where: {
          dimoVehicleId: { not: null },
          status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.RENTED] },
          dimoVehicle: {
            connectionStatus: 'CONNECTED',
            tokenId: { not: null },
          },
        },
        select: { id: true },
      });

      if (vehicles.length === 0) {
        this.logger.log(
          `Resume backfill: no DIMO-connected vehicles to reconcile — skipping.`,
        );
        return;
      }

      this.logger.log(
        `Resume backfill: reconciling ${vehicles.length} vehicle(s) ` +
          `over window ${cappedFrom.toISOString()} → ${now.toISOString()}.`,
      );

      let totalApplied = 0;
      let totalProposed = 0;
      let failures = 0;

      for (const { id: vehicleId } of vehicles) {
        try {
          const result = await this.reconciliation.triggerManualReconciliation(
            vehicleId,
            {
              from: cappedFrom,
              to: now,
              useDimoSegmentFallback: true,
            },
          );
          totalApplied += result.repairsApplied;
          totalProposed += result.repairsProposed;
          if (result.repairsApplied > 0 || result.repairsProposed > 0) {
            this.logger.log(
              `Resume backfill [${vehicleId}]: proposed=${result.repairsProposed} applied=${result.repairsApplied}`,
            );
          }
        } catch (err: unknown) {
          failures += 1;
          this.logger.warn(
            `Resume backfill failed for ${vehicleId}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Resume backfill complete — proposed=${totalProposed} applied=${totalApplied} failures=${failures} ` +
          `across ${vehicles.length} vehicle(s).`,
      );
    } catch (err: unknown) {
      this.logger.warn(`Resume backfill pass aborted: ${(err as Error).message}`);
    } finally {
      this.backfillInProgress = false;
    }
  }
}
