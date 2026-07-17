import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwilioModule } from '@modules/twilio/twilio.module';
import { VoiceCallOrchestrationModule } from '@modules/voice-call-orchestration/voice-call-orchestration.module';
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
import { AgentDeploymentController } from './agent-deployment/agent-deployment.controller';
import { AgentDeploymentDiffService } from './agent-deployment/agent-deployment-diff.service';
import { AgentDeploymentReadinessService } from './agent-deployment/agent-deployment-readiness.service';
import { AgentDeploymentService } from './agent-deployment/agent-deployment.service';

@Module({
  imports: [PrismaModule, ConfigModule, TwilioModule, forwardRef(() => VoiceCallOrchestrationModule)],
  controllers: [
    VoiceAssistantController,
    VoiceAssistantAdminController,
    ElevenLabsTwilioImportController,
    AgentDeploymentController,
  ],
  providers: [
    VoiceAssistantService,
    ElevenLabsService,
    ElevenLabsProviderHttpClient,
    ElevenLabsProviderTenantResolver,
    ElevenLabsProviderAdapter,
    ElevenLabsTwilioImportCredentialsResolver,
    ElevenLabsTwilioImportProvisioningService,
    AgentDeploymentDiffService,
    AgentDeploymentReadinessService,
    AgentDeploymentService,
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
    AgentDeploymentService,
  ],
})
export class VoiceAssistantModule {}
