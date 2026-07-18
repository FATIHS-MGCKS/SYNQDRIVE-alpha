import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwilioModule } from '@modules/twilio/twilio.module';
import { VoiceBillingModule } from '@modules/voice-billing/voice-billing.module';
import { VoiceCallOrchestrationModule } from '@modules/voice-call-orchestration/voice-call-orchestration.module';
import { VoiceProtectionModule } from '@modules/voice-protection/voice-protection.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { VoiceEntitlementModule } from '@modules/voice-entitlement/voice-entitlement.module';
import { VoiceRolloutModule } from '@modules/voice-rollout/voice-rollout.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
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
import { VoiceControlPlaneAdminController } from './admin/voice-control-plane-admin.controller';
import { VoiceControlPlaneAdminService } from './admin/voice-control-plane-admin.service';
import { VoiceProviderWebhookEventRepository } from './control-plane/voice-audit-persistence.repository';
import { VoiceRetentionService } from './security/voice-retention.service';
import { VoiceSecretsStartupService } from './security/voice-secrets-startup.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    TwilioModule,
    forwardRef(() => VoiceCallOrchestrationModule),
    VoiceProtectionModule,
    VoiceBillingModule,
    VoiceEntitlementModule,
    VoiceRolloutModule,
    VoiceWebhookIngestionModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.VOICE_WEBHOOK_PROCESS }),
  ],
  controllers: [
    VoiceAssistantController,
    VoiceAssistantAdminController,
    VoiceControlPlaneAdminController,
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
    VoiceProviderWebhookEventRepository,
    VoiceControlPlaneAdminService,
    VoiceRetentionService,
    VoiceSecretsStartupService,
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
    VoiceRetentionService,
  ],
})
export class VoiceAssistantModule {}
