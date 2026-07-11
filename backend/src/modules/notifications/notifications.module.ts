import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { NotificationRepository } from './notification.repository';

/**
 * Notification domain module — contract layer (Prompt 5) + Prisma persistence (Prompt 6).
 * No dashboard API cutover or delivery dispatch yet.
 */
@Module({
  imports: [PrismaModule],
  providers: [NotificationRepository],
  exports: [NotificationRepository],
})
export class NotificationsModule {}
