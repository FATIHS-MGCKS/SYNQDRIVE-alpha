import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { BusinessInsightsModule } from '@modules/business-insights/business-insights.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BookingNotificationAdapter } from './adapters/booking-notification.adapter';
import { DrivingAssessmentNotificationAdapter } from './adapters/driving-assessment-notification.adapter';
import { NotificationProducerIngestService } from './adapters/notification-producer.ingest.service';
import { NotificationProducerRouter } from './adapters/notification-producer.router';
import { StationShortageNotificationAdapter } from './adapters/station-shortage-notification.adapter';
import { LowUtilizationNotificationAdapter } from './adapters/low-utilization-notification.adapter';
import { VehicleHealthNotificationAdapter } from './adapters/vehicle-health-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './adapters/technical-observation-notification.adapter';
import { NotificationCoreService } from './notification-core.service';
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationRepository } from './notification.repository';
import { NotificationEvaluationObservabilityService } from './runtime/notification-evaluation-observability.service';
import { NotificationEvaluationService } from './runtime/notification-evaluation.service';
import { NotificationsController } from './api/notifications.controller';
import { NotificationApiService } from './api/notification-api.service';
import { NotificationPreferenceService } from './access/notification-preference.service';
import { NotificationReceiptService } from './access/notification-receipt.service';
import { NotificationStationScopeService } from './access/notification-station-scope.service';
import { NotificationDeliveryPolicyService } from './delivery/notification-delivery-policy.service';
import { NotificationDeliveryOutboxRepository } from './delivery/notification-delivery-outbox.repository';
import { NotificationDeliveryEnqueueService } from './delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryObservabilityService } from './delivery/notification-delivery-observability.service';
import { NotificationDeliverySchedulerService } from './delivery/notification-delivery-scheduler.service';
import { NotificationDeliveryProcessorService } from './delivery/notification-delivery-processor.service';
import {
  NotificationChannelDispatcher,
  NotificationEmailChannelService,
  NotificationPushChannelService,
} from './delivery/notification-delivery-channels.service';
import { NotificationMigrationAnalysisService } from './migration/notification-migration-analysis.service';
import { NotificationMigrationBackfillService } from './migration/notification-migration-backfill.service';
import { NotificationMigrationAcceptanceService } from './migration/notification-migration-acceptance.service';
import { NotificationArchitectureAuditService } from './migration/notification-architecture-audit.service';

/**
 * Notification domain — contract, Prisma, core engine, event registry, shadow adapters, evaluation runtime, REST API, delivery outbox.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ObservabilityModule,
    forwardRef(() => OutboundEmailModule),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATION_EVALUATION },
      { name: QUEUE_NAMES.NOTIFICATION_DELIVERY },
    ),
    forwardRef(() => BusinessInsightsModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    NotificationApiService,
    NotificationPreferenceService,
    NotificationReceiptService,
    NotificationStationScopeService,
    NotificationDeliveryPolicyService,
    NotificationDeliveryOutboxRepository,
    NotificationDeliveryEnqueueService,
    NotificationDeliveryObservabilityService,
    NotificationDeliverySchedulerService,
    NotificationDeliveryProcessorService,
    NotificationEmailChannelService,
    NotificationPushChannelService,
    NotificationChannelDispatcher,
    NotificationMigrationAnalysisService,
    NotificationMigrationBackfillService,
    NotificationMigrationAcceptanceService,
    NotificationArchitectureAuditService,
    DrivingAssessmentNotificationAdapter,
    BookingNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
    LowUtilizationNotificationAdapter,
    VehicleHealthNotificationAdapter,
    NotificationProducerRouter,
    NotificationProducerIngestService,
    NotificationEvaluationObservabilityService,
    NotificationEvaluationService,
  ],
  exports: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    NotificationApiService,
    NotificationReceiptService,
    NotificationStationScopeService,
    NotificationProducerRouter,
    NotificationProducerIngestService,
    NotificationEvaluationObservabilityService,
    NotificationEvaluationService,
    NotificationDeliveryProcessorService,
    NotificationDeliverySchedulerService,
    NotificationMigrationAnalysisService,
    NotificationMigrationBackfillService,
    NotificationMigrationAcceptanceService,
    NotificationArchitectureAuditService,
    DrivingAssessmentNotificationAdapter,
    BookingNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
    LowUtilizationNotificationAdapter,
    VehicleHealthNotificationAdapter,
  ],
})
export class NotificationsModule {}
