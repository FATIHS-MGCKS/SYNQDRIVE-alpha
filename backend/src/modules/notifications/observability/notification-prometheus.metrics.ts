import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { toSafeMetricLabel } from '../compliance/notification-data-minimization';

export type NotificationIngestOperation =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'reopened'
  | 'ignored';

export function recordNotificationCandidate(
  metrics: TripMetricsService,
  labels: { sourceType: string; eventType: string },
): void {
  metrics.notificationCandidatesTotal.inc({
    source_type: toSafeMetricLabel(labels.sourceType),
    event_type: toSafeMetricLabel(labels.eventType),
  });
}

export function recordNotificationCandidateRejected(
  metrics: TripMetricsService,
  reason: string,
): void {
  metrics.notificationCandidatesRejectedTotal.inc({
    reason: toSafeMetricLabel(reason),
  });
}

export function recordNotificationIngestOperationMetric(
  metrics: TripMetricsService,
  operation: NotificationIngestOperation,
  domain: string,
): void {
  const safeDomain = toSafeMetricLabel(domain);
  switch (operation) {
    case 'created':
      metrics.notificationsCreated.inc({ domain: safeDomain });
      break;
    case 'updated':
      metrics.notificationsUpdated.inc({ domain: safeDomain });
      break;
    case 'resolved':
      metrics.notificationsResolved.inc({ domain: safeDomain });
      break;
    case 'reopened':
      metrics.notificationsReopened.inc({ domain: safeDomain });
      break;
    case 'ignored':
      metrics.notificationDeduplicated.inc();
      break;
    default:
      break;
  }
}

export function recordNotificationDuplicateConflict(metrics: TripMetricsService): void {
  metrics.notificationDuplicateConstraintViolation.inc();
  metrics.notificationDuplicateConflictsTotal.inc();
}

export function recordNotificationIngestDuration(
  metrics: TripMetricsService,
  eventType: string,
  seconds: number,
): void {
  metrics.notificationIngestDuration.observe(
    { event_type: toSafeMetricLabel(eventType) },
    seconds,
  );
}

export function recordNotificationEvaluationRunDuration(
  metrics: TripMetricsService,
  triggerClass: string,
  seconds: number,
): void {
  metrics.notificationRunDuration.observe(
    { trigger_class: toSafeMetricLabel(triggerClass) },
    seconds,
  );
}

export function recordNotificationDeliveryAttempt(
  metrics: TripMetricsService,
  channel: string,
): void {
  metrics.notificationDeliveryAttemptsTotal.inc({
    channel: toSafeMetricLabel(channel),
  });
}

export function recordNotificationDeadLetter(
  metrics: TripMetricsService,
  channel: string,
  errorCode: string,
): void {
  metrics.notificationDeadLettersTotal.inc({
    channel: toSafeMetricLabel(channel),
    error_code: toSafeMetricLabel(errorCode),
  });
}

export function recordNotificationWorkflowTriggered(
  metrics: TripMetricsService,
  lifecycleEvent: string,
): void {
  metrics.notificationWorkflowRunsTotal.inc({
    lifecycle_event: toSafeMetricLabel(lifecycleEvent),
    result: 'scheduled',
  });
}

export function recordNotificationWorkflowDuplicateSuppressed(
  metrics: TripMetricsService,
  lifecycleEvent: string,
): void {
  metrics.notificationWorkflowDuplicatesSuppressedTotal.inc({
    lifecycle_event: toSafeMetricLabel(lifecycleEvent),
  });
}

export function recordNotificationIngestFailure(
  metrics: TripMetricsService,
  errorCode: string,
): void {
  metrics.notificationIngestFailuresTotal.inc({
    error_code: toSafeMetricLabel(errorCode),
  });
}

export function recordNotificationApiRequest(
  metrics: TripMetricsService,
  labels: { route: string; method: string; statusClass: string; result: string },
  durationSeconds: number,
): void {
  metrics.notificationApiRequestDuration.observe(
    {
      route: toSafeMetricLabel(labels.route),
      method: toSafeMetricLabel(labels.method),
      result: toSafeMetricLabel(labels.result),
    },
    durationSeconds,
  );
  metrics.notificationApiRequestsTotal.inc({
    route: toSafeMetricLabel(labels.route),
    method: toSafeMetricLabel(labels.method),
    status_class: toSafeMetricLabel(labels.statusClass),
    result: toSafeMetricLabel(labels.result),
  });
}

export function setNotificationOutboxPending(metrics: TripMetricsService, count: number): void {
  metrics.notificationQueueBacklog.set(count);
  metrics.notificationOutboxPending.set(count);
}
