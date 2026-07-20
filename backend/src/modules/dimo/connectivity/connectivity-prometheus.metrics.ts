import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type ConnectivityWebhookOutcome =
  | 'received'
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'failed';

export type ConnectivityRecoverySource = 'snapshot' | 'telemetry' | 'explicit_plug';

export type ConnectivityRuntimeDimension =
  | 'overall'
  | 'telemetry'
  | 'provider_link'
  | 'physical_device';

export function recordConnectivityWebhookReceived(
  metrics: TripMetricsService,
  input: { provider: string; event_type: string },
): void {
  metrics.connectivityWebhookReceivedTotal.inc(input);
}

export function recordConnectivityWebhookProcessingFailed(
  metrics: TripMetricsService,
  input: { provider: string; reason: string },
): void {
  metrics.connectivityWebhookProcessingFailedTotal.inc(input);
}

export function recordConnectivityWebhookDeadLetter(
  metrics: TripMetricsService,
  input: { provider: string; reason: string },
): void {
  metrics.connectivityWebhookDeadLetterTotal.inc(input);
}

export function recordConnectivityEpisodeOpened(
  metrics: TripMetricsService,
  input: { provider: string; reason: string },
): void {
  metrics.connectivityEpisodeOpenedTotal.inc(input);
}

export function recordConnectivityEpisodeResolved(
  metrics: TripMetricsService,
  input: { provider: string; method: string },
): void {
  metrics.connectivityEpisodeResolvedTotal.inc(input);
}

export function recordConnectivityEpisodeFalseOpen(
  metrics: TripMetricsService,
  input: { classification: string },
): void {
  metrics.connectivityEpisodeFalseOpenDetectedTotal.inc(input);
}

export function recordConnectivityRecoverySnapshot(
  metrics: TripMetricsService,
  input: { outcome: string },
): void {
  metrics.connectivityRecoverySnapshotTotal.inc(input);
}

export function recordConnectivityRecoveryTelemetry(
  metrics: TripMetricsService,
  input: { outcome: string },
): void {
  metrics.connectivityRecoveryTelemetryTotal.inc(input);
}

export function recordConnectivityBindingChanged(
  metrics: TripMetricsService,
  input: { provider: string; outcome: string },
): void {
  metrics.connectivityBindingChangedTotal.inc(input);
}

export function recordConnectivityStateConflict(
  metrics: TripMetricsService,
  input: { surface: string; reason: string },
): void {
  metrics.connectivityStateConflictTotal.inc(input);
}

export function recordConnectivityRuntimeState(
  metrics: TripMetricsService,
  input: { overall_state: string },
): void {
  metrics.connectivityRuntimeStateTotal.inc(input);
}

export function recordConnectivityTelemetryState(
  metrics: TripMetricsService,
  input: { telemetry_state: string },
): void {
  metrics.connectivityTelemetryStateTotal.inc(input);
}

export function recordConnectivityProviderLinkState(
  metrics: TripMetricsService,
  input: { provider_link_state: string },
): void {
  metrics.connectivityProviderLinkStateTotal.inc(input);
}

export function recordConnectivityDeviceState(
  metrics: TripMetricsService,
  input: { physical_device_state: string },
): void {
  metrics.connectivityDeviceStateTotal.inc(input);
}

export function recordConnectivityAlert(
  metrics: TripMetricsService,
  input: { alert_type: string; action: 'created' | 'resolved' },
): void {
  if (input.action === 'created') {
    metrics.connectivityAlertTotal.inc({ alert_type: input.alert_type });
  } else {
    metrics.connectivityAlertResolvedTotal.inc({ alert_type: input.alert_type });
  }
}

export function setConnectivityCoverageRatio(
  metrics: TripMetricsService,
  input: { coverage_state: string },
  ratio: number,
): void {
  metrics.connectivityCoverageRatio.set(input, ratio);
}

export function recordConnectivityReconciliationConflict(
  metrics: TripMetricsService,
  input: { classification: string },
): void {
  metrics.connectivityReconciliationConflictTotal.inc(input);
}
