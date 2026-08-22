import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import smsConfig from '@config/sms.config';
import { CommunicationModule } from '@modules/communication/communication.module';
import { SmsConversationRepository } from './repositories/sms-conversation.repository';
import { SmsMessageRepository } from './repositories/sms-message.repository';
import { SmsWebhookEventRepository } from './repositories/sms-webhook-event.repository';
import { SmsWebhookSecurityService } from './services/sms-webhook-security.service';
import { SmsConfigService } from './sms-config.service';
import { SmsController } from './sms.controller';

/**
 * C5.1 — SMS native persistence + webhook security foundation.
 * C8.4 — read-only org SMS config endpoint (no secrets).
 */
@Module({
  imports: [ConfigModule.forFeature(smsConfig), CommunicationModule],
  controllers: [SmsController],
  providers: [
    SmsConversationRepository,
    SmsMessageRepository,
    SmsWebhookEventRepository,
    SmsWebhookSecurityService,
    SmsConfigService,
  ],
  exports: [
    SmsConversationRepository,
    SmsMessageRepository,
    SmsWebhookEventRepository,
    SmsWebhookSecurityService,
    SmsConfigService,
  ],
})
export class SmsPersistenceModule {}
