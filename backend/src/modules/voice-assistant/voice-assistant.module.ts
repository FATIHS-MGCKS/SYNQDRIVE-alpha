import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwilioModule } from '@modules/twilio/twilio.module';
import { ElevenLabsService } from './elevenlabs.service';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceAssistantController, VoiceAssistantAdminController } from './voice-assistant.controller';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProviderAccountRepository,
  VoiceProvisioningJobRepository,
  VoiceSubscriptionRepository,
} from './control-plane/voice-control-plane.repository';
import { ElevenLabsProviderAdapter } from './elevenlabs-provider/elevenlabs-provider.adapter';
import { ElevenLabsProviderHttpClient } from './elevenlabs-provider/elevenlabs-provider.http-client';
import { ElevenLabsProviderTenantResolver } from './elevenlabs-provider/elevenlabs-provider.tenant-resolver';
import { ElevenLabsTwilioImportController } from './provisioning/elevenlabs-twilio-import.controller';
import { ElevenLabsTwilioImportCredentialsResolver } from './provisioning/elevenlabs-twilio-import-credentials.resolver';
import { ElevenLabsTwilioImportProvisioningService } from './provisioning/elevenlabs-twilio-import-provisioning.service';

@Module({
  imports: [PrismaModule, ConfigModule, TwilioModule],
  controllers: [
    VoiceAssistantController,
    VoiceAssistantAdminController,
    ElevenLabsTwilioImportController,
  ],
  providers: [
    VoiceAssistantService,
    ElevenLabsService,
    ElevenLabsProviderHttpClient,
    ElevenLabsProviderTenantResolver,
    ElevenLabsProviderAdapter,
    ElevenLabsTwilioImportCredentialsResolver,
    ElevenLabsTwilioImportProvisioningService,
    VoiceSubscriptionRepository,
    VoiceProviderAccountRepository,
    VoicePhoneNumberRepository,
    VoiceAgentDeploymentRepository,
    VoiceProvisioningJobRepository,
  ],
  exports: [
    VoiceAssistantService,
    ElevenLabsProviderAdapter,
    VoiceSubscriptionRepository,
    VoiceProviderAccountRepository,
    VoicePhoneNumberRepository,
    VoiceAgentDeploymentRepository,
    VoiceProvisioningJobRepository,
    ElevenLabsTwilioImportProvisioningService,
  ],
})
export class VoiceAssistantModule {}
