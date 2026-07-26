import type { VehicleComplaint } from '@prisma/client';
import { InsightSeverity } from '@modules/business-insights/insight.types';
import { NotificationSeverity } from '../notification.enums';
import { ACTIVE_OBSERVATION_DB_STATUSES } from '@modules/technical-observations/technical-observations.mapper';

export function isActiveObservationStatus(status: VehicleComplaint['status']): boolean {
  return ACTIVE_OBSERVATION_DB_STATUSES.includes(status);
}

/** Booking / service-case / task context for notification correlation. */
export function observationNotificationCorrelationId(
  row: Pick<
    VehicleComplaint,
    'bookingId' | 'linkedServiceCaseId' | 'convertedToTaskId' | 'linkedServiceTaskId'
  >,
): string | undefined {
  return (
    row.bookingId
    ?? row.linkedServiceCaseId
    ?? row.linkedServiceTaskId
    ?? row.convertedToTaskId
    ?? undefined
  );
}

/** Handover protocol or upstream task that caused the observation. */
export function observationNotificationCausationId(
  row: Pick<VehicleComplaint, 'handoverProtocolId' | 'linkedServiceTaskId' | 'id'>,
): string | undefined {
  return row.handoverProtocolId ?? row.linkedServiceTaskId ?? undefined;
}

export function mapObservationUrgencyToNotificationSeverity(
  urgency: VehicleComplaint['urgency'],
): NotificationSeverity {
  switch (urgency) {
    case 'CRITICAL':
      return NotificationSeverity.CRITICAL;
    case 'HIGH':
      return NotificationSeverity.WARNING;
    case 'LOW':
      return NotificationSeverity.INFO;
    default:
      return NotificationSeverity.WARNING;
  }
}

export function mapObservationUrgencyToInsightSeverity(
  urgency: VehicleComplaint['urgency'],
): InsightSeverity {
  switch (urgency) {
    case 'CRITICAL':
      return InsightSeverity.CRITICAL;
    case 'HIGH':
      return InsightSeverity.WARNING;
    case 'LOW':
      return InsightSeverity.INFO;
    default:
      return InsightSeverity.WARNING;
  }
}
