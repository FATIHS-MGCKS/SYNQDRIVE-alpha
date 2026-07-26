import { Module } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationOperationalNotificationService } from './integration-operational-notification.service';

@Module({
  imports: [NotificationsModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationOperationalNotificationService],
  exports: [IntegrationsService, IntegrationOperationalNotificationService],
})
export class IntegrationsModule {}
