import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { SecretRefResolver } from './secrets/secret-ref.resolver';
import { TwilioControlPlaneClient } from './twilio-control-plane.client';
import { TwilioControlPlaneTelephonyService } from './twilio-control-plane.telephony.service';
import { TwilioService } from './twilio.service';
import { TwilioTelephonyService } from './twilio-telephony.service';
import { TwilioTenantClientFactory } from './twilio-tenant-client.factory';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioWebhookService } from './twilio-webhook.service';
import { TwilioVoiceBridgeService } from './twilio-voice-bridge.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TwilioWebhookController],
  providers: [
    SecretRefResolver,
    TwilioService,
    TwilioControlPlaneClient,
    TwilioTenantClientFactory,
    TwilioTelephonyService,
    TwilioControlPlaneTelephonyService,
    TwilioWebhookService,
    TwilioVoiceBridgeService,
  ],
  exports: [
    TwilioService,
    TwilioTelephonyService,
    TwilioControlPlaneTelephonyService,
    TwilioTenantClientFactory,
    TwilioVoiceBridgeService,
  ],
})
export class TwilioModule {}
