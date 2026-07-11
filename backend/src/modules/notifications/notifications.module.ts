import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { NotificationCoreService } from './notification-core.service';
import { NotificationEngineConfig } from './notification-engine.config';
import { NotificationRepository } from './notification.repository';

/**
 * Notification domain module — contract (P5), Prisma (P6), core engine (P7).
 * Gated by NOTIFICATIONS_V2; no dashboard API cutover yet.
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [NotificationRepository, NotificationEngineConfig, NotificationCoreService],
  exports: [NotificationRepository, NotificationEngineConfig, NotificationCoreService],
})
export class NotificationsModule {}
