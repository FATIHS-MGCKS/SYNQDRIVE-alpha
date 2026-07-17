import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwilioService } from './twilio.service';
import { TwilioTelephonyService } from './twilio-telephony.service';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioWebhookService } from './twilio-webhook.service';
import { TwilioVoiceBridgeService } from './twilio-voice-bridge.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TwilioWebhookController],
  providers: [
    TwilioService,
    TwilioTelephonyService,
    TwilioWebhookService,
    TwilioVoiceBridgeService,
  ],
  exports: [TwilioService, TwilioTelephonyService, TwilioVoiceBridgeService],
})
export class TwilioModule {}
