import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import {
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { VoiceCallOrchestrationModule } from '@modules/voice-call-orchestration/voice-call-orchestration.module';
import { SecretRefResolver } from './secrets/secret-ref.resolver';
import { TwilioProvisioningProviderClient } from './provisioning/twilio-provisioning-provider.client';
import { TwilioSecretStoreService } from './provisioning/twilio-secret-store.service';
import { TwilioTenantProvisioningController } from './provisioning/twilio-tenant-provisioning.controller';
import { TwilioTenantProvisioningService } from './provisioning/twilio-tenant-provisioning.service';
import { TwilioControlPlaneClient } from './twilio-control-plane.client';
import { TwilioControlPlaneTelephonyService } from './twilio-control-plane.telephony.service';
import { TwilioService } from './twilio.service';
import { TwilioTelephonyService } from './twilio-telephony.service';
import { TwilioTenantClientFactory } from './twilio-tenant-client.factory';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioWebhookService } from './twilio-webhook.service';
import { TwilioVoiceBridgeService } from './twilio-voice-bridge.service';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => VoiceWebhookIngestionModule), forwardRef(() => VoiceCallOrchestrationModule)],
  controllers: [TwilioWebhookController, TwilioTenantProvisioningController],
  providers: [
    SecretRefResolver,
    TwilioService,
    TwilioControlPlaneClient,
    TwilioTenantClientFactory,
    TwilioTelephonyService,
    TwilioControlPlaneTelephonyService,
    TwilioWebhookService,
    TwilioVoiceBridgeService,
    TwilioProvisioningProviderClient,
    TwilioSecretStoreService,
    TwilioTenantProvisioningService,
    VoiceSubscriptionRepository,
    VoicePhoneNumberRepository,
    VoiceProvisioningJobRepository,
  ],
  exports: [
    TwilioService,
    TwilioTelephonyService,
    TwilioControlPlaneTelephonyService,
    TwilioTenantClientFactory,
    TwilioVoiceBridgeService,
    TwilioTenantProvisioningService,
    SecretRefResolver,
  ],
})
export class TwilioModule {}
