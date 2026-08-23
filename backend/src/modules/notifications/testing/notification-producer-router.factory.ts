import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationIngestObservabilityService } from '../observability/notification-ingest-observability.service';
import { DrivingAssessmentNotificationAdapter } from '../adapters/driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from '../adapters/technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from '../adapters/station-shortage-notification.adapter';
import { VehicleHealthNotificationAdapter } from '../adapters/vehicle-health-notification.adapter';
import { ServiceComplianceNotificationAdapter } from '../adapters/service-compliance-notification.adapter';
import { VehicleAlertsNotificationAdapter } from '../adapters/vehicle-alerts-notification.adapter';
import { VehicleReadinessNotificationAdapter } from '../adapters/vehicle-readiness-notification.adapter';
import { VehicleReadinessEvaluabilityNotificationAdapter } from '../adapters/vehicle-readiness-evaluability-notification.adapter';
import { VehicleDamageNotificationAdapter } from '../adapters/vehicle-damage-notification.adapter';
import { CommunicationHandoffNotificationAdapter } from '../adapters/communication-handoff-notification.adapter';
import { NotificationProducerRouter } from '../adapters/notification-producer.router';

export function createNotificationProducerRouter(
  core: NotificationCoreService,
  engineConfig: NotificationEngineConfig,
  ingestObservability: NotificationIngestObservabilityService,
): NotificationProducerRouter {
  return new NotificationProducerRouter(
    core,
    engineConfig,
    ingestObservability,
    new DrivingAssessmentNotificationAdapter(),
    new TechnicalObservationNotificationAdapter(),
    new StationShortageNotificationAdapter(),
    new VehicleHealthNotificationAdapter(),
    new ServiceComplianceNotificationAdapter(),
    new VehicleAlertsNotificationAdapter(),
    new VehicleReadinessNotificationAdapter(),
    new VehicleReadinessEvaluabilityNotificationAdapter(),
    new VehicleDamageNotificationAdapter(),
    new CommunicationHandoffNotificationAdapter(),
  );
}
