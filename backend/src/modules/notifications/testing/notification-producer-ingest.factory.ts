import { DrivingAssessmentNotificationAdapter } from '../adapters/driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from '../adapters/technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from '../adapters/station-shortage-notification.adapter';
import { LowUtilizationNotificationAdapter } from '../adapters/low-utilization-notification.adapter';
import { VehicleHealthNotificationAdapter } from '../adapters/vehicle-health-notification.adapter';
import { ServiceComplianceNotificationAdapter } from '../adapters/service-compliance-notification.adapter';
import { VehicleAlertsNotificationAdapter } from '../adapters/vehicle-alerts-notification.adapter';
import { VehicleReadinessNotificationAdapter } from '../adapters/vehicle-readiness-notification.adapter';
import { VehicleReadinessEvaluabilityNotificationAdapter } from '../adapters/vehicle-readiness-evaluability-notification.adapter';
import { VehicleDamageNotificationAdapter } from '../adapters/vehicle-damage-notification.adapter';
import { CommunicationHandoffNotificationAdapter } from '../adapters/communication-handoff-notification.adapter';
import { NotificationProducerIngestService } from '../adapters/notification-producer.ingest.service';
import { NotificationProducerRouter } from '../adapters/notification-producer.router';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';

export function createNotificationProducerIngestService(
  router: NotificationProducerRouter,
  repository: NotificationRepository,
  core: NotificationCoreService,
): NotificationProducerIngestService {
  return new NotificationProducerIngestService(
    router,
    repository,
    new DrivingAssessmentNotificationAdapter(),
    new TechnicalObservationNotificationAdapter(),
    new StationShortageNotificationAdapter(),
    new LowUtilizationNotificationAdapter(),
    new VehicleHealthNotificationAdapter(),
    new ServiceComplianceNotificationAdapter(),
    new VehicleAlertsNotificationAdapter(),
    new VehicleReadinessNotificationAdapter(),
    new VehicleReadinessEvaluabilityNotificationAdapter(),
    new VehicleDamageNotificationAdapter(),
    new CommunicationHandoffNotificationAdapter(),
    core,
  );
}
