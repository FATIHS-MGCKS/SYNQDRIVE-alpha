import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { VoiceMcpGatewayModule } from '@modules/voice-mcp-gateway/voice-mcp-gateway.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { VoiceProtectionModule } from '@modules/voice-protection/voice-protection.module';
import { VoiceRolloutModule } from '@modules/voice-rollout/voice-rollout.module';
import { VoicePhoneNumberRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceCallOrchestrationService } from './voice-call-orchestration.service';
import { VoiceCallPolicyService } from './voice-call-policy.service';

@Module({
  imports: [
    PrismaModule,
    VoiceRolloutModule,
    forwardRef(() => VoiceAssistantModule),
    forwardRef(() => VoiceMcpGatewayModule),
    VoiceWebhookIngestionModule,
    VoiceProtectionModule,
  ],
  providers: [
    VoiceCallOrchestrationService,
    VoiceCallPolicyService,
    VoicePhoneNumberRepository,
  ],
  exports: [VoiceCallOrchestrationService, VoiceCallPolicyService],
})
export class VoiceCallOrchestrationModule {}
