import { CommunicationEventType } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { CommunicationNormalizationErrorCode } from '../normalization/communication-normalization.errors';
import type { CommunicationHealthChannel } from './communication-operational-health.constants';
import { COMMUNICATION_UNKNOWN_SEND_CHANNELS } from './communication-operational-health.constants';

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

export type CommunicationAiOperation =
  | 'intent_detect'
  | 'action_execute'
  | 'summary_generate'
  | 'handoff_classify'
  | 'unknown';

const COMMUNICATION_EVENT_TYPES = new Set<string>(Object.values(CommunicationEventType));
const PROJECTION_ERROR_CODES = new Set<string>([
  ...Object.values(CommunicationNormalizationErrorCode),
  'PROJECTION_FAILURE',
]);
const AI_OPERATIONS = new Set<CommunicationAiOperation>([
  'intent_detect',
  'action_execute',
  'summary_generate',
  'handoff_classify',
  'unknown',
]);

const METRIC_CHANNELS: CommunicationMetricChannel[] = ['whatsapp', 'voice', 'sms', 'email'];

function normalizeChannel(channel: string): CommunicationMetricChannel {
  const value = channel.toLowerCase();
  if (value === 'whatsapp' || value === 'voice' || value === 'sms' || value === 'email') {
    return value;
  }
  return 'unknown';
}

export function normalizeCommunicationEventType(eventType: string): string {
  if (COMMUNICATION_EVENT_TYPES.has(eventType)) {
    return eventType;
  }
  return 'UNKNOWN_EVENT_TYPE';
}

export function normalizeProjectionErrorCode(errorCode: string | undefined): string {
  if (errorCode && PROJECTION_ERROR_CODES.has(errorCode)) {
    return errorCode;
  }
  return 'PROJECTION_FAILURE';
}

export function normalizeCommunicationAiOperation(operation: string): CommunicationAiOperation {
  const normalized = operation.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (AI_OPERATIONS.has(normalized as CommunicationAiOperation)) {
    return normalized as CommunicationAiOperation;
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
  const eventType = normalizeCommunicationEventType(input.eventType);
  const channel = normalizeChannel(input.channel);
  metrics.communicationProjectionTotal.inc({
    channel,
    event_type: eventType,
    result: input.result,
  });
  if (input.result === 'failed') {
    metrics.communicationProjectionFailuresTotal.inc({
      channel,
      event_type: eventType,
      error_code: normalizeProjectionErrorCode(input.errorCode),
    });
  }
  if (input.lagSeconds != null && Number.isFinite(input.lagSeconds)) {
    metrics.communicationProjectionLagSeconds.observe(
      { channel, event_type: eventType },
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
  const operation = normalizeCommunicationAiOperation(input.operation);
  metrics.communicationAiOperationTotal.inc({
    operation,
    result: input.result,
  });
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    metrics.communicationAiOperationDurationSeconds.observe(
      { operation },
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

export function refreshCommunicationSendUnknownGauges(
  metrics: TripMetricsService,
  byChannel: Record<CommunicationHealthChannel, { count: number; oldestAgeSeconds: number | null }>,
): void {
  for (const channel of COMMUNICATION_UNKNOWN_SEND_CHANNELS) {
    const metricChannel = normalizeChannel(channel);
    const signals = byChannel[channel];
    setCommunicationSendUnknownCurrent(metrics, metricChannel, signals?.count ?? 0);
    setCommunicationSendUnknownOldestSeconds(metrics, metricChannel, signals?.oldestAgeSeconds ?? null);
  }
  for (const metricChannel of METRIC_CHANNELS) {
    const hasChannel = COMMUNICATION_UNKNOWN_SEND_CHANNELS.some(
      (channel) => normalizeChannel(channel) === metricChannel,
    );
    if (!hasChannel) {
      setCommunicationSendUnknownCurrent(metrics, metricChannel, 0);
      setCommunicationSendUnknownOldestSeconds(metrics, metricChannel, null);
    }
  }
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
