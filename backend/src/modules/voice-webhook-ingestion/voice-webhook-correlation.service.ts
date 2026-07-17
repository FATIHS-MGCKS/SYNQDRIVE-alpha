import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { VoiceControlPlaneProvider } from '@prisma/client';

export type VoiceWebhookCorrelationKeys = {
  organizationId?: string | null;
  voiceConversationId?: string | null;
  twilioCallSid?: string | null;
  elevenLabsConversationId?: string | null;
  agentDeploymentId?: string | null;
  phoneNumberId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
};

@Injectable()
export class VoiceWebhookCorrelationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFromTwilioForm(
    organizationId: string | null,
    form: Record<string, string>,
  ): Promise<VoiceWebhookCorrelationKeys> {
    const callSid = form.CallSid?.trim() || null;
    const conversation = callSid
      ? await this.prisma.voiceConversation.findFirst({
          where: {
            twilioCallSid: callSid,
            ...(organizationId ? { organizationId } : {}),
          },
          select: {
            id: true,
            organizationId: true,
            voiceAssistantId: true,
          },
        })
      : null;

    const assistant = conversation?.voiceAssistantId
      ? await this.prisma.voiceAssistant.findFirst({
          where: { id: conversation.voiceAssistantId },
          select: { phoneNumberId: true, organizationId: true },
        })
      : organizationId
        ? await this.resolveAssistantByToNumber(organizationId, form.To)
        : null;

    const deployment = conversation?.voiceAssistantId
      ? await this.prisma.voiceAgentDeployment.findFirst({
          where: {
            voiceAssistantId: conversation.voiceAssistantId,
            status: 'ACTIVE',
            organizationId: conversation.organizationId,
          },
          orderBy: { activatedVersion: 'desc' },
          select: { id: true },
        })
      : null;

    return {
      organizationId: conversation?.organizationId ?? organizationId ?? assistant?.organizationId ?? null,
      voiceConversationId: conversation?.id ?? null,
      twilioCallSid: callSid,
      agentDeploymentId: deployment?.id ?? null,
      phoneNumberId: assistant?.phoneNumberId ?? null,
    };
  }

  async resolveFromElevenLabsPayload(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<VoiceWebhookCorrelationKeys> {
    const conversationId =
      this.readString(payload, 'conversation_id') ||
      this.readString(payload, 'conversationId') ||
      this.readNestedString(payload, ['data', 'conversation_id']) ||
      this.readNestedString(payload, ['data', 'conversationId']);

    const callSid =
      this.readString(payload, 'call_sid') ||
      this.readNestedString(payload, ['metadata', 'call_sid']) ||
      this.readNestedString(payload, ['data', 'metadata', 'call_sid']);

    const conversation = await this.findConversation({
      organizationId,
      elevenLabsConversationId: conversationId,
      twilioCallSid: callSid,
    });

    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { activatedVersion: 'desc' },
      select: { id: true, voiceAssistantId: true },
    });

    const assistant = deployment?.voiceAssistantId
      ? await this.prisma.voiceAssistant.findFirst({
          where: { id: deployment.voiceAssistantId, organizationId },
          select: { phoneNumberId: true },
        })
      : null;

    const secureCustomerId = await this.resolveSecureCustomerId(
      organizationId,
      conversation?.id ?? null,
      payload,
    );
    const secureBookingId = await this.resolveSecureBookingId(
      organizationId,
      conversation?.id ?? null,
      payload,
    );

    return {
      organizationId,
      voiceConversationId: conversation?.id ?? null,
      twilioCallSid: conversation?.twilioCallSid ?? callSid,
      elevenLabsConversationId: conversation?.elevenLabsConvId ?? conversationId,
      agentDeploymentId: deployment?.id ?? null,
      phoneNumberId: assistant?.phoneNumberId ?? null,
      customerId: secureCustomerId,
      bookingId: secureBookingId,
    };
  }

  async resolveFromInternalEvent(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<VoiceWebhookCorrelationKeys> {
    const voiceConversationId = this.readString(payload, 'voiceConversationId');
    const conversation = voiceConversationId
      ? await this.prisma.voiceConversation.findFirst({
          where: { id: voiceConversationId, organizationId },
        })
      : null;

    if (voiceConversationId && !conversation) {
      return { organizationId };
    }

    return {
      organizationId,
      voiceConversationId: conversation?.id ?? voiceConversationId ?? null,
      twilioCallSid: conversation?.twilioCallSid ?? this.readString(payload, 'twilioCallSid'),
      elevenLabsConversationId:
        conversation?.elevenLabsConvId ?? this.readString(payload, 'elevenLabsConversationId'),
      agentDeploymentId: this.readString(payload, 'agentDeploymentId'),
      phoneNumberId: this.readString(payload, 'phoneNumberId'),
      customerId: await this.resolveSecureCustomerId(
        organizationId,
        conversation?.id ?? voiceConversationId ?? null,
        payload,
      ),
      bookingId: await this.resolveSecureBookingId(
        organizationId,
        conversation?.id ?? voiceConversationId ?? null,
        payload,
      ),
    };
  }

  assertOrganizationMatch(
    expectedOrganizationId: string | null | undefined,
    resolved: VoiceWebhookCorrelationKeys,
  ): void {
    if (!expectedOrganizationId || !resolved.organizationId) {
      return;
    }
    if (expectedOrganizationId !== resolved.organizationId) {
      throw new Error('Cross-tenant correlation mismatch');
    }
  }

  private async findConversation(params: {
    organizationId: string;
    elevenLabsConversationId?: string | null;
    twilioCallSid?: string | null;
  }) {
    if (params.elevenLabsConversationId) {
      const byEl = await this.prisma.voiceConversation.findFirst({
        where: {
          organizationId: params.organizationId,
          elevenLabsConvId: params.elevenLabsConversationId,
        },
      });
      if (byEl) return byEl;
    }
    if (params.twilioCallSid) {
      return this.prisma.voiceConversation.findFirst({
        where: {
          organizationId: params.organizationId,
          twilioCallSid: params.twilioCallSid,
        },
      });
    }
    return null;
  }

  private async resolveAssistantByToNumber(organizationId: string, to: string | undefined) {
    const normalized = to?.trim();
    if (!normalized) return null;
    return this.prisma.voiceAssistant.findFirst({
      where: {
        organizationId,
        OR: [{ phoneNumber: normalized }, { phoneNumber: normalized.replace(/\s+/g, '') }],
      },
      select: { organizationId: true, phoneNumberId: true },
    });
  }

  private async resolveSecureCustomerId(
    organizationId: string,
    voiceConversationId: string | null,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const explicit = this.readString(payload, 'customerId');
    if (!explicit || !voiceConversationId) {
      return null;
    }
    const toolExecution = await this.prisma.voiceToolExecution.findFirst({
      where: {
        organizationId,
        voiceConversationId,
        redactedOutput: { path: ['customerId'], equals: explicit },
      },
      select: { id: true },
    });
    return toolExecution ? explicit : null;
  }

  private async resolveSecureBookingId(
    organizationId: string,
    voiceConversationId: string | null,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const explicit = this.readString(payload, 'bookingId');
    if (!explicit || !voiceConversationId) {
      return null;
    }
    const toolExecution = await this.prisma.voiceToolExecution.findFirst({
      where: {
        organizationId,
        voiceConversationId,
        redactedOutput: { path: ['bookingId'], equals: explicit },
      },
      select: { id: true },
    });
    return toolExecution ? explicit : null;
  }

  private readString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readNestedString(payload: Record<string, unknown>, path: string[]): string | null {
    let current: unknown = payload;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.trim() ? current.trim() : null;
  }
}
