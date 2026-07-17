import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { VoiceMcpGatewayModule } from '@modules/voice-mcp-gateway/voice-mcp-gateway.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import {
  VoiceBudgetPolicyRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import {
  VoicePhoneNumberRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceCallOrchestrationService } from './voice-call-orchestration.service';
import { VoiceCallPolicyService } from './voice-call-policy.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => VoiceAssistantModule),
    VoiceMcpGatewayModule,
    VoiceWebhookIngestionModule,
  ],
  providers: [
    VoiceCallOrchestrationService,
    VoiceCallPolicyService,
    VoiceSubscriptionRepository,
    VoiceBudgetPolicyRepository,
    VoicePhoneNumberRepository,
  ],
  exports: [VoiceCallOrchestrationService, VoiceCallPolicyService],
})
export class VoiceCallOrchestrationModule {}
