import { registerAs } from '@nestjs/config';

export default registerAs('workflowRuntime', () => ({
  actionLeaseMs: parseInt(process.env.WORKFLOW_RUNTIME_ACTION_LEASE_MS ?? '60000', 10),
  actionHeartbeatMs: parseInt(process.env.WORKFLOW_RUNTIME_ACTION_HEARTBEAT_MS ?? '15000', 10),
  actionTimeoutMs: parseInt(process.env.WORKFLOW_RUNTIME_ACTION_TIMEOUT_MS ?? '120000', 10),
  minActionTimeoutMs: parseInt(process.env.WORKFLOW_RUNTIME_MIN_ACTION_TIMEOUT_MS ?? '5000', 10),
  maxActionTimeoutMs: parseInt(process.env.WORKFLOW_RUNTIME_MAX_ACTION_TIMEOUT_MS ?? '600000', 10),
  staleRunningMs: parseInt(process.env.WORKFLOW_RUNTIME_STALE_RUNNING_MS ?? '120000', 10),
  maxActionAttempts: parseInt(process.env.WORKFLOW_RUNTIME_MAX_ACTION_ATTEMPTS ?? '5', 10),
  retryBackoffMs: parseInt(process.env.WORKFLOW_RUNTIME_RETRY_BACKOFF_MS ?? '30000', 10),
  maxRetryBackoffMs: parseInt(process.env.WORKFLOW_RUNTIME_MAX_RETRY_BACKOFF_MS ?? '900000', 10),
  maxRunDurationMs: parseInt(process.env.WORKFLOW_RUNTIME_MAX_RUN_DURATION_MS ?? '86400000', 10),
  pollBatchSize: parseInt(process.env.WORKFLOW_RUNTIME_POLL_BATCH ?? '25', 10),
  approvalTtlHours: parseInt(process.env.WORKFLOW_RUNTIME_APPROVAL_TTL_HOURS ?? '72', 10),
  schedulerEnabled: process.env.WORKFLOW_RUNTIME_SCHEDULER_ENABLED !== 'false',
  maxFallbackDepth: parseInt(process.env.WORKFLOW_RUNTIME_MAX_FALLBACK_DEPTH ?? '3', 10),
}));
