import { Injectable } from '@nestjs/common';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { listShadowModeEventTypes } from '../registry/notification-event-registry';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';

/**
 * Routes adapter output to core engine — only shadow-enabled event types when V2 is on.
 */
@Injectable()
export class NotificationProducerRouter {
  private readonly adapters: NotificationProducerAdapter[];

  constructor(
    private readonly core: NotificationCoreService,
    private readonly engineConfig: NotificationEngineConfig,
    drivingAssessment: DrivingAssessmentNotificationAdapter,
    technicalObservation: TechnicalObservationNotificationAdapter,
    stationShortage: StationShortageNotificationAdapter,
  ) {
    this.adapters = [drivingAssessment, technicalObservation, stationShortage];
  }

  get registeredAdapters(): readonly NotificationProducerAdapter[] {
    return this.adapters;
  }

  async ingestFromAdapter<T>(
    adapter: NotificationProducerAdapter<T>,
    source: T,
    context: NotificationAdapterContext,
  ) {
    if (!adapter.canHandle(source)) {
      return { skipped: true, reason: 'ADAPTER_CANNOT_HANDLE' as const };
    }

    const candidate = adapter.toCandidate(source, context);
    if (!candidate) {
      return { skipped: true, reason: 'NO_CANDIDATE' as const };
    }

    const shadowTypes = new Set(listShadowModeEventTypes());
    if (adapter.shadowModeOnly && !shadowTypes.has(candidate.eventType)) {
      return { skipped: true, reason: 'NOT_SHADOW_ENABLED' as const };
    }

    if (!this.engineConfig.isV2Enabled()) {
      return { skipped: true, reason: 'FLAG_OFF' as const };
    }

    return this.core.ingestCandidate(candidate, { runId: context.runId });
  }
}
