import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  StationShortageAdapterSource,
} from './notification-adapter.types';

/** Shadow-mode adapter — maps station shortage detector output to registry candidate. */
@Injectable()
export class StationShortageNotificationAdapter
  implements NotificationProducerAdapter<StationShortageAdapterSource>
{
  readonly adapterId = 'station-shortage';
  readonly supportedEventTypes = ['STATION_SHORTAGE'] as const;
  readonly shadowModeOnly = true;

  canHandle(source: StationShortageAdapterSource): boolean {
    return Boolean(source.stationId && source.stationName);
  }

  toCandidate(
    source: StationShortageAdapterSource,
    context: NotificationAdapterContext,
  ) {
    const severity =
      source.available <= 0 ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'STATION_SHORTAGE',
      entityId: source.stationId,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity: source.cleared ? NotificationSeverity.SUCCESS : severity,
      templateParams: {
        stationName: source.stationName,
        label: source.stationName,
        available: source.available,
        totalVehicles: source.totalVehicles,
        bookedOut: source.bookedOut,
        threshold: source.threshold,
        stationId: source.stationId,
      },
      actionTargetContext: { stationId: source.stationId },
      expiresAt: source.expiresAt,
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        bookedOut: source.bookedOut,
      },
    });

    return validateRegistryCandidate(candidate);
  }
}
