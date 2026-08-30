import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { Gauge } from 'prom-client';

const DIMO_BOUND_QUEUES: Array<{ name: string; queueName: string }> = [
  { name: 'dimo.snapshot.poll', queueName: QUEUE_NAMES.DIMO_SNAPSHOT },
  { name: 'dimo.trip-tracking', queueName: QUEUE_NAMES.TRIP_TRACKING },
  { name: 'trip.behavior.enrichment', queueName: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
  { name: 'dimo.dtc.poll', queueName: QUEUE_NAMES.DTC_POLL },
  { name: 'dimo.vehicle.sync', queueName: QUEUE_NAMES.DIMO_VEHICLE_SYNC },
  { name: 'battery.v2', queueName: QUEUE_NAMES.BATTERY_V2 },
];

export interface QueueBackpressureSnapshot {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  oldestJobAgeSeconds: number | null;
}

@Injectable()
export class DimoQueueBackpressureService implements OnModuleInit {
  private readonly logger = new Logger(DimoQueueBackpressureService.name);
  private queueWaiting!: Gauge<string>;
  private queueActive!: Gauge<string>;
  private queueOldestAge!: Gauge<string>;

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly snapshotQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRIP_TRACKING) private readonly tripTrackingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT)
    private readonly behaviorQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DTC_POLL) private readonly dtcQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DIMO_VEHICLE_SYNC) private readonly vehicleSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BATTERY_V2) private readonly batteryQueue: Queue,
    private readonly tripMetrics: TripMetricsService,
  ) {}

  onModuleInit(): void {
    const registry = this.tripMetrics.registry;
    this.queueWaiting = new Gauge({
      name: 'synqdrive_queue_waiting',
      help: 'BullMQ waiting job count for DIMO-bound queues',
      labelNames: ['queue'],
      registers: [registry],
    });
    this.queueActive = new Gauge({
      name: 'synqdrive_queue_active',
      help: 'BullMQ active job count for DIMO-bound queues',
      labelNames: ['queue'],
      registers: [registry],
    });
    this.queueOldestAge = new Gauge({
      name: 'synqdrive_queue_oldest_job_age_seconds',
      help: 'Age of oldest waiting job in seconds',
      labelNames: ['queue'],
      registers: [registry],
    });
  }

  private queueByName(name: string): Queue | undefined {
    switch (name) {
      case QUEUE_NAMES.DIMO_SNAPSHOT:
        return this.snapshotQueue;
      case QUEUE_NAMES.TRIP_TRACKING:
        return this.tripTrackingQueue;
      case QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT:
        return this.behaviorQueue;
      case QUEUE_NAMES.DTC_POLL:
        return this.dtcQueue;
      case QUEUE_NAMES.DIMO_VEHICLE_SYNC:
        return this.vehicleSyncQueue;
      case QUEUE_NAMES.BATTERY_V2:
        return this.batteryQueue;
      default:
        return undefined;
    }
  }

  async snapshotQueues(): Promise<QueueBackpressureSnapshot[]> {
    const results: QueueBackpressureSnapshot[] = [];
    for (const entry of DIMO_BOUND_QUEUES) {
      const queue = this.queueByName(entry.queueName);
      if (!queue) continue;
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
      const waiting = counts.waiting ?? 0;
      const active = counts.active ?? 0;
      const delayed = counts.delayed ?? 0;
      const oldestAge = await this.readOldestWaitingAgeSeconds(queue);

      this.queueWaiting.set({ queue: entry.name }, waiting);
      this.queueActive.set({ queue: entry.name }, active);
      if (oldestAge != null) {
        this.queueOldestAge.set({ queue: entry.name }, oldestAge);
      }

      results.push({
        queue: entry.name,
        waiting,
        active,
        delayed,
        oldestJobAgeSeconds: oldestAge,
      });
    }
    return results;
  }

  async shouldDeferSnapshotEnqueue(thresholdWaiting = 500): Promise<boolean> {
    const snap = await this.snapshotQueues();
    const snapshot = snap.find((q) => q.queue === 'dimo.snapshot.poll');
    if (!snapshot) return false;
    return snapshot.waiting >= thresholdWaiting;
  }

  private async readOldestWaitingAgeSeconds(queue: Queue): Promise<number | null> {
    try {
      const jobs = await queue.getJobs(['waiting'], 0, 0, true);
      const oldest = jobs[0];
      if (!oldest?.timestamp) return null;
      return Math.max(0, (Date.now() - oldest.timestamp) / 1000);
    } catch (err) {
      this.logger.debug(`Oldest job age read failed: ${(err as Error).message}`);
      return null;
    }
  }
}
