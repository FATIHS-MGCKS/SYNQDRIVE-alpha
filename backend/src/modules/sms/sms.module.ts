import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { TwilioModule } from '@modules/twilio/twilio.module';
import twilioConfig from '@config/twilio.config';
import { SmsConsentService } from './sms-consent.service';
import { SmsMessagingService } from './sms-messaging.service';
import { SmsWebhookService } from './sms-webhook.service';
import { OutboundSmsService } from './outbound-sms.service';
import { SmsWebhookController } from './sms-webhook.controller';

@Module({
  imports: [ConfigModule.forFeature(twilioConfig), ActivityLogModule, TwilioModule],
  controllers: [SmsWebhookController],
  providers: [SmsConsentService, SmsMessagingService, SmsWebhookService, OutboundSmsService],
  exports: [SmsConsentService, SmsMessagingService, SmsWebhookService, OutboundSmsService],
})
export class SmsModule {}
