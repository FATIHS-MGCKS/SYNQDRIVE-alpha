import { QUEUE_NAMES } from '@workers/queues/queue-names';

/** All BullMQ queue names — single source for metrics refresh and QueueEvents. */
export const ALL_WORKER_QUEUES = Object.values(QUEUE_NAMES);

/** NestJS @Cron / @Interval scheduler identifiers (low-cardinality). */
export const WORKER_SCHEDULER_NAMES = [
  'dimo.snapshot.enqueue',
  'dimo.snapshot.sweep_failed',
  'dimo.dtc.poll',
  'dimo.vehicle.sync',
  'tire.recalculation',
  'brake.recalculation',
  'trip.tracking.recovery',
  'trip.analysis.recovery',
  'trip.reconciliation.warm',
  'trip.reconciliation.cold',
  'trip.reconciliation.daily',
  'driving.analysis.reconciliation',
  'payment.connect.reconciliation',
  'billing.reconciliation',
  'hm.health.polling',
  'data.retention',
  'storage.orphan.sweep',
  'battery.v2.reconciliation',
  'battery.v2.retention',
  'voice.retention',
  'iam.data.retention',
  'document.retention',
  'document.intake.action.recovery',
  'document.extraction.recovery',
] as const;

export type WorkerSchedulerName = (typeof WORKER_SCHEDULER_NAMES)[number];
