import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import smsConfig from '@config/sms.config';
import { CommunicationModule } from '@modules/communication/communication.module';
import { SMS_PROVIDER_PORT } from '@modules/communication/sms/sms-provider.port';
import { SmsPersistenceModule } from './sms-persistence.module';
import { SmsController } from './controllers/sms.controller';
import { SmsWebhookController } from './controllers/sms-webhook.controller';
import { SentDmSmsAdapter } from './providers/sentdm-sms.adapter';
import { SmsConfigService } from './services/sms-config.service';
import { SmsService } from './services/sms.service';
import { SmsWebhookProcessorService } from './services/sms-webhook-processor.service';

/**
 * C5.2 — sent.dm SMS runtime (send + webhook processing + canonical projection bridge).
 */
@Module({
  imports: [
    ConfigModule.forFeature(smsConfig),
    CommunicationModule,
    SmsPersistenceModule,
  ],
  controllers: [SmsController, SmsWebhookController],
  providers: [
    SmsConfigService,
    SmsService,
    SmsWebhookProcessorService,
    SentDmSmsAdapter,
    { provide: SMS_PROVIDER_PORT, useExisting: SentDmSmsAdapter },
  ],
  exports: [SmsService, SmsConfigService],
})
export class SmsModule {}
