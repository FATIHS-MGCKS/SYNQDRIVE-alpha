import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { BusinessInsightsModule } from '@modules/business-insights/business-insights.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DrivingAssessmentNotificationAdapter } from './adapters/driving-assessment-notification.adapter';
import { NotificationProducerIngestService } from './adapters/notification-producer.ingest.service';
import { NotificationProducerRouter } from './adapters/notification-producer.router';
import { StationShortageNotificationAdapter } from './adapters/station-shortage-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './adapters/technical-observation-notification.adapter';
import { NotificationCoreService } from './notification-core.service';
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationRepository } from './notification.repository';
import { NotificationEvaluationObservabilityService } from './runtime/notification-evaluation-observability.service';
import { NotificationEvaluationService } from './runtime/notification-evaluation.service';
import { NotificationsController } from './api/notifications.controller';
import { NotificationApiService } from './api/notification-api.service';

/**
 * Notification domain — contract, Prisma, core engine, event registry, shadow adapters, evaluation runtime, REST API.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION_EVALUATION }),
    forwardRef(() => BusinessInsightsModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    NotificationApiService,
    DrivingAssessmentNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
    NotificationProducerRouter,
    NotificationProducerIngestService,
    NotificationEvaluationObservabilityService,
    NotificationEvaluationService,
    NotificationApiService,
  ],
  exports: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    NotificationProducerRouter,
    NotificationProducerIngestService,
    NotificationEvaluationObservabilityService,
    NotificationEvaluationService,
    DrivingAssessmentNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
  ],
})
export class NotificationsModule {}
