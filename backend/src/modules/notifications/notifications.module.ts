import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { DrivingAssessmentNotificationAdapter } from './adapters/driving-assessment-notification.adapter';
import { NotificationProducerIngestService } from './adapters/notification-producer.ingest.service';
import { NotificationProducerRouter } from './adapters/notification-producer.router';
import { StationShortageNotificationAdapter } from './adapters/station-shortage-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './adapters/technical-observation-notification.adapter';
import { NotificationCoreService } from './notification-core.service';
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationRepository } from './notification.repository';

/**
 * Notification domain — contract, Prisma, core engine, event registry, shadow adapters.
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    DrivingAssessmentNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
    NotificationProducerRouter,
    NotificationProducerIngestService,
  ],
  exports: [
    NotificationRepository,
    NotificationEngineConfig,
    NotificationCoreService,
    NotificationProducerRouter,
    NotificationProducerIngestService,
    DrivingAssessmentNotificationAdapter,
    TechnicalObservationNotificationAdapter,
    StationShortageNotificationAdapter,
  ],
})
export class NotificationsModule {}
