import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type CommunicationMetricChannel = 'whatsapp' | 'voice' | 'sms' | 'email' | 'unknown';
export type CommunicationMetricOperation =
  | 'send'
  | 'project'
  | 'reconcile'
  | 'handoff'
  | 'media'
  | 'template'
  | 'ai'
  | 'retention';
export type CommunicationMetricResult = 'success' | 'failed' | 'unknown' | 'skipped';

function normalizeChannel(channel: string): CommunicationMetricChannel {
  const value = channel.toLowerCase();
  if (value === 'whatsapp' || value === 'voice' || value === 'sms' || value === 'email') {
    return value;
  }
  return 'unknown';
}

export function recordCommunicationProjection(
  metrics: TripMetricsService,
  input: {
    channel: string;
    eventType: string;
    result: CommunicationMetricResult;
    errorCode?: string;
    lagSeconds?: number;
  },
): void {
  metrics.communicationProjectionTotal.inc({
    channel: normalizeChannel(input.channel),
    event_type: input.eventType,
    result: input.result,
  });
  if (input.result === 'failed') {
    metrics.communicationProjectionFailuresTotal.inc({
      channel: normalizeChannel(input.channel),
      event_type: input.eventType,
      error_code: input.errorCode ?? 'PROJECTION_FAILURE',
    });
  }
  if (input.lagSeconds != null && Number.isFinite(input.lagSeconds)) {
    metrics.communicationProjectionLagSeconds.observe(
      { channel: normalizeChannel(input.channel), event_type: input.eventType },
      Math.max(0, input.lagSeconds),
    );
  }
}

export function recordCommunicationSend(
  metrics: TripMetricsService,
  input: {
    channel: string;
    result: CommunicationMetricResult;
    reason?: string;
    durationSeconds?: number;
  },
): void {
  metrics.communicationSendTotal.inc({
    channel: normalizeChannel(input.channel),
    result: input.result,
  });
  if (input.result === 'unknown' && input.reason) {
    metrics.communicationSendUnknownTotal.inc({
      channel: normalizeChannel(input.channel),
      reason: input.reason,
    });
  }
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    metrics.communicationSendDurationSeconds.observe(
      { channel: normalizeChannel(input.channel) },
      Math.max(0, input.durationSeconds),
    );
  }
}

export function recordCommunicationReconciliation(
  metrics: TripMetricsService,
  input: {
    channel: string;
    result: CommunicationMetricResult;
  },
): void {
  metrics.communicationReconciliationTotal.inc({
    channel: normalizeChannel(input.channel),
    result: input.result,
  });
}

export function recordCommunicationHandoff(
  metrics: TripMetricsService,
  input: {
    channel: string;
    result: CommunicationMetricResult;
  },
): void {
  metrics.communicationHandoffTotal.inc({
    channel: normalizeChannel(input.channel),
    result: input.result,
  });
}

export function recordCommunicationAiOperation(
  metrics: TripMetricsService,
  input: {
    operation: string;
    result: CommunicationMetricResult;
    durationSeconds?: number;
  },
): void {
  metrics.communicationAiOperationTotal.inc({
    operation: input.operation,
    result: input.result,
  });
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    metrics.communicationAiOperationDurationSeconds.observe(
      { operation: input.operation },
      Math.max(0, input.durationSeconds),
    );
  }
}

export function recordCommunicationRetentionRun(
  metrics: TripMetricsService,
  input: {
    dryRun: boolean;
    status: string;
    affected?: number;
    failed?: number;
  },
): void {
  metrics.communicationRetentionRunsTotal.inc({
    dry_run: input.dryRun ? 'true' : 'false',
    status: input.status.toLowerCase(),
  });
  if (input.affected != null && input.affected > 0) {
    metrics.communicationRetentionRowsAffectedTotal.inc(input.affected);
  }
  if (input.failed != null && input.failed > 0) {
    metrics.communicationRetentionRunFailuresTotal.inc(input.failed);
  }
}

export function setCommunicationSendUnknownCurrent(
  metrics: TripMetricsService,
  channel: string,
  count: number,
): void {
  metrics.communicationSendUnknownCurrent.set(
    { channel: normalizeChannel(channel) },
    Math.max(0, count),
  );
}

export function setCommunicationSendUnknownOldestSeconds(
  metrics: TripMetricsService,
  channel: string,
  seconds: number | null,
): void {
  metrics.communicationSendUnknownOldestSeconds.set(
    { channel: normalizeChannel(channel) },
    seconds == null ? 0 : Math.max(0, seconds),
  );
}

export function setCommunicationRetentionLastSuccessTimestamp(
  metrics: TripMetricsService,
  unixSeconds: number,
): void {
  metrics.communicationRetentionLastSuccessTimestamp.set(unixSeconds);
}

export function setCommunicationReconciliationLastSuccessTimestamp(
  metrics: TripMetricsService,
  channel: string,
  unixSeconds: number,
): void {
  metrics.communicationReconciliationLastSuccessTimestamp.set(
    { channel: normalizeChannel(channel) },
    unixSeconds,
  );
}
