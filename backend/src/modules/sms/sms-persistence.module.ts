import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import smsConfig from '@config/sms.config';
import { CommunicationModule } from '@modules/communication/communication.module';
import { SmsConversationRepository } from './repositories/sms-conversation.repository';
import { SmsMessageRepository } from './repositories/sms-message.repository';
import { SmsWebhookEventRepository } from './repositories/sms-webhook-event.repository';
import { SmsWebhookSecurityService } from './services/sms-webhook-security.service';

/**
 * C5.1 — SMS native persistence + webhook security foundation.
 * No billable HTTP runtime (send/webhook controllers belong to C5.2).
 */
@Module({
  imports: [ConfigModule.forFeature(smsConfig), CommunicationModule],
  providers: [
    SmsConversationRepository,
    SmsMessageRepository,
    SmsWebhookEventRepository,
    SmsWebhookSecurityService,
  ],
  exports: [
    SmsConversationRepository,
    SmsMessageRepository,
    SmsWebhookEventRepository,
    SmsWebhookSecurityService,
  ],
})
export class SmsPersistenceModule {}
