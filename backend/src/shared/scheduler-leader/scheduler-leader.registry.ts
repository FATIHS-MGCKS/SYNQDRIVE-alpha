/**
 * Bounded scheduler name enum for metrics and guard labels.
 * Add new singleton schedulers here when introducing @Cron/@Interval producers.
 */
export const SINGLETON_GLOBAL_SCHEDULER_NAMES = [
  'dimo_snapshot_tick',
  'dimo_snapshot_janitor',
  'trip_reconciliation_fast',
  'trip_reconciliation_warm',
  'trip_reconciliation_cold',
  'trip_tracking_recovery',
  'trip_analysis_recovery',
  'tire_recalculation',
  'brake_recalculation',
  'payment_connect_reconciliation',
  'billing_reconciliation',
  'hm_health_polling',
  'driving_analysis_reconciliation',
  'data_retention',
  'storage_orphan_sweep',
  'battery_v2_reconciliation',
  'battery_v2_retention',
  'voice_retention',
  'iam_data_retention',
  'document_retention',
  'document_intake_action_recovery',
  'document_extraction_recovery',
  'device_connection_webhook_inbox',
  'communication_retention',
  'legal_document_retention',
  'booking_document_generation_recovery_minute',
  'booking_document_generation_recovery_five_minute',
  'payment_email',
  'vehicle_warning_retention',
  'notification_delivery',
  'notification_retention',
  'invoice_overdue_mark',
  'invoice_overdue_reconcile_stale',
  'invoice_overdue_refresh_payment_tasks',
  'invite_email',
  'iam_audit_outbox',
  'task_automation_outbox',
  'business_insights',
  'business_audit_outbox',
  'booking_eligibility_recheck',
  'billing_domain_event_outbox',
  'billing_domain_event_email',
] as const;

export type SingletonGlobalSchedulerName =
  (typeof SINGLETON_GLOBAL_SCHEDULER_NAMES)[number];

/** BullMQ repeat schedulers — idempotent upsertJobScheduler, safe on every replica. */
export const SAFE_DISTRIBUTED_SCHEDULER_NAMES = [
  'dimo_dtc_bullmq_repeat',
  'dimo_vehicle_sync_bullmq_repeat',
] as const;

/** Per-process metrics / heartbeat work — intentionally runs on every replica. */
export const REPLICA_LOCAL_SCHEDULER_NAMES = [
  'metrics_refresh_dependency',
  'metrics_refresh_queue_failed',
  'metrics_refresh_clickhouse',
  'metrics_refresh_battery_postgres',
  'metrics_refresh_voice',
  'communication_metrics_refresh',
  'notification_metrics_refresh',
  'iam_metrics_refresh',
] as const;

export type SchedulerClassification =
  | 'SINGLETON_GLOBAL'
  | 'SAFE_DISTRIBUTED'
  | 'REPLICA_LOCAL';

export function isSingletonGlobalSchedulerName(
  name: string,
): name is SingletonGlobalSchedulerName {
  return (SINGLETON_GLOBAL_SCHEDULER_NAMES as readonly string[]).includes(name);
}
