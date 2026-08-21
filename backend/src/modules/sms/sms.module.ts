import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import smsConfig from '@config/sms.config';
import { CommunicationModule } from '@modules/communication/communication.module';
import { SmsController, SmsWebhookController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsWebhookService } from './sms-webhook.service';
import { SentDmSmsAdapter } from './providers/sentdm-sms.adapter';

@Module({
  imports: [ConfigModule.forFeature(smsConfig), CommunicationModule],
  controllers: [SmsController, SmsWebhookController],
  providers: [SmsService, SmsWebhookService, SentDmSmsAdapter],
  exports: [SmsService, SentDmSmsAdapter, SmsWebhookService],
})
export class SmsModule {}
