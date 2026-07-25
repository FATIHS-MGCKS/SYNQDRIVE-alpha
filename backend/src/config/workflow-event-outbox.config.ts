import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value !== 'false' && value !== '0';
}

function resolveOutboxEnabled(): boolean {
  const explicit = process.env.WORKFLOW_EVENT_OUTBOX_ENABLED;
  if (explicit === 'false') {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      console.error(
        '[workflow-event-outbox] WORKFLOW_EVENT_OUTBOX_ENABLED=false is not permitted in production; outbox worker remains enabled.',
      );
      return true;
    }
    return false;
  }
  return explicit !== '0';
}

export default registerAs('workflowEventOutbox', () => ({
  enabled: resolveOutboxEnabled(),
  maxAttempts: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_MAX_ATTEMPTS ?? '8', 10),
  baseBackoffMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_BACKOFF_MS ?? '30000', 10),
  maxBackoffMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_MAX_BACKOFF_MS ?? '900000', 10),
  jitterMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_JITTER_MS ?? '5000', 10),
  pollBatchSize: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_POLL_BATCH ?? '50', 10),
  jobAttempts: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_JOB_ATTEMPTS ?? '3', 10),
  jobBackoffMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_JOB_BACKOFF_MS ?? '15000', 10),
  leaseMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_LEASE_MS ?? '60000', 10),
  heartbeatMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_HEARTBEAT_MS ?? '15000', 10),
  staleClaimMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_STALE_CLAIM_MS ?? '120000', 10),
  shutdownDrainMs: parseInt(process.env.WORKFLOW_EVENT_OUTBOX_SHUTDOWN_DRAIN_MS ?? '30000', 10),
  emitBookingLifecycle: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_BOOKING_LIFECYCLE, true),
  emitBookingTiming: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_BOOKING_TIMING, true),
  emitVehicleHealth: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_VEHICLE_HEALTH, true),
  emitVehicleDtc: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_VEHICLE_DTC, true),
  emitVehicleTelemetry: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_VEHICLE_TELEMETRY, true),
  emitBilling: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_BILLING, true),
  emitCustomer: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_CUSTOMER, true),
  emitDamage: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_DAMAGE, true),
  emitService: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_SERVICE, true),
  emitTask: parseBooleanEnv(process.env.WORKFLOW_EVENT_EMIT_TASK, true),
}));
