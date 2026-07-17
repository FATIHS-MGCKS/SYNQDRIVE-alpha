import { Injectable, ForbiddenException } from '@nestjs/common';
import { VoiceAssistantStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  VoiceProtectionDeniedError,
  toProtectionHttpException,
} from '@modules/voice-protection/voice-protection-reason-codes';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { isVoiceNativeTwilioIntegrationEnabled } from './voice-feature-flags.config';

@Injectable()
export class VoiceCallPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enforcement: VoiceBudgetEnforcementService,
  ) {}

  async assertOutboundCallAllowed(params: {
    organizationId: string;
    toE164: string;
    voiceAssistantId: string;
    conversationId?: string;
  }): Promise<{ conversationSlotId: string }> {
    if (!isVoiceNativeTwilioIntegrationEnabled()) {
      throw new ForbiddenException(
        'Native ElevenLabs-Twilio outbound calls are not enabled for this environment.',
      );
    }

    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: params.voiceAssistantId, organizationId: params.organizationId },
    });
    if (!assistant) {
      throw new ForbiddenException('Voice assistant not found for organization.');
    }
    if (assistant.status !== VoiceAssistantStatus.ACTIVE) {
      throw this.denied({
        reasonCode: 'assistant_inactive',
        message: 'Voice assistant is not active.',
      });
    }
    if (!assistant.outboundEnabled) {
      throw this.denied({
        reasonCode: 'outbound_disabled',
        message: 'Outbound calls are disabled for this assistant.',
      });
    }

    try {
      return await this.enforcement.assertOutboundAllowed({
        organizationId: params.organizationId,
        toE164: params.toE164,
        voiceAssistantId: params.voiceAssistantId,
        conversationId: params.conversationId,
      });
    } catch (err) {
      if (err instanceof VoiceProtectionDeniedError) {
        throw toProtectionHttpException(err);
      }
      throw err;
    }
  }

  async assertLegacyDiagnosticAllowed(params: {
    organizationId: string;
    toE164: string;
    initiatedByUserId: string;
  }): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: params.organizationId,
        userId: params.initiatedByUserId,
        status: 'ACTIVE',
        role: { in: ['ORG_ADMIN', 'SUB_ADMIN'] },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Legacy diagnostic calls require an organization administrator.');
    }

    try {
      await this.enforcement.assertOutboundAllowed({
        organizationId: params.organizationId,
        toE164: params.toE164,
        voiceAssistantId: 'legacy-diagnostic',
        skipConcurrencyReserve: true,
      });
    } catch (err) {
      if (err instanceof VoiceProtectionDeniedError) {
        throw toProtectionHttpException(err);
      }
      throw err;
    }
  }

  private denied(params: { reasonCode: string; message: string }) {
    return toProtectionHttpException(
      new VoiceProtectionDeniedError({
        reasonCode: params.reasonCode as never,
        message: params.message,
      }),
    );
  }
}
