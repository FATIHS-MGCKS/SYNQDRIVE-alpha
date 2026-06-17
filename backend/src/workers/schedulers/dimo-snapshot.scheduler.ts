import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '@modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

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

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly reconciliation: TripReconciliationService,
  ) {}

  @Interval(30000)
  async enqueueSnapshotJobs(): Promise<void> {
    if (!canEnqueueQueue(this.logger, 'dimo-snapshot')) return;
    const tickStartedAt = new Date();

    // Resume-gap detection runs BEFORE the normal enqueue body so that the
    // backfill pass observes the same DIMO-connected vehicle set as the
    // snapshot polling itself, and runs only once per resume (further ticks
    // will see a fresh lastTickAt and no longer cross the threshold).
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
      include: { dimoVehicle: true },
    });

    let enqueued = 0;
    let recovered = 0;
    let skipped = 0;

    for (const v of vehicles) {
      const tokenId = v.dimoVehicle?.tokenId;
      if (tokenId == null) continue;

      const jobId = `snapshot-${v.id}`;

      // Before re-adding, drop any lingering terminal-state job (failed /
      // completed that wasn't auto-removed) that would otherwise dedup the
      // new add into a silent no-op. Active jobs are intentionally left
      // alone — BullMQ will reject removal of active jobs and we honor
      // that so we never kill an in-flight snapshot.
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
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (msg.toLowerCase().includes('duplicate')) {
          // An in-flight job still exists — this is healthy, not a problem.
          skipped += 1;
        } else {
          this.logger.warn(`Failed to enqueue snapshot for ${v.id}: ${msg}`);
        }
      }
    }

    if (vehicles.length > 0) {
      this.logger.debug(
        `Snapshot tick: matched=${vehicles.length} enqueued=${enqueued} recovered=${recovered} skipped_inflight=${skipped}`,
      );
      if (recovered > 0) {
        this.logger.log(
          `Snapshot scheduler recovered ${recovered} vehicle(s) from stuck terminal-state jobs`,
        );
      }
    }

    // Record completion wall-clock AFTER the tick body so the next tick
    // measures the true inter-tick gap, not just the scheduler drift.
    this.lastTickAt = new Date();
  }

  /**
   * Hourly janitor: sweep any failed jobs older than 10 min out of Redis.
   *
   * Even with the per-tick recovery above this is useful for two reasons:
   *   - if the scheduler tick itself errors between the getJob() and add(),
   *     the old failed job survives and would keep blocking the next tick;
   *   - bounds Redis memory over very long runtimes.
   *
   * Only the `dimo.snapshot.poll` queue is touched. Age is in ms.
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

  /**
   * One-shot trip backfill across the resume gap.
   *
   * Runs asynchronously (fire-and-forget from the tick) and is guarded by
   * `backfillInProgress` so that if the host takes multiple ticks to fully
   * catch up, we don't fan out overlapping reconciliations.
   *
   * The window is `[previousTickAt − BACKFILL_LOOKBACK_BUFFER_MS, now]`,
   * capped to MAX_BACKFILL_WINDOW_MS to avoid absurd fan-outs after a
   * multi-day outage (the daily cold tier handles that case instead).
   *
   * We intentionally target the same vehicle set as the normal snapshot
   * tick — any vehicle that was AVAILABLE/RENTED and DIMO-connected when we
   * resumed is a candidate for a missed trip during the freeze.
   */
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
