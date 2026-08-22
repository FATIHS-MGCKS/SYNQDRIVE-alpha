import { Injectable } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { readVoiceConversationContext } from '../adapters/voice/voice-communication.shared';
import type {
  CommunicationIdentityHints,
  NativeCommunicationContext,
} from './communication-context.types';
import { normalizeCommunicationPhone } from './communication-phone.util';

export interface LoadedNativeCommunicationFacts {
  nativeContext: NativeCommunicationContext;
  identityHints: CommunicationIdentityHints;
}

@Injectable()
export class CommunicationNativeContextLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadFacts(
    organizationId: string,
    channel: CommunicationChannel,
    nativeConversationId: string,
  ): Promise<LoadedNativeCommunicationFacts | null> {
    switch (channel) {
      case CommunicationChannel.WHATSAPP:
        return this.loadWhatsApp(organizationId, nativeConversationId);
      case CommunicationChannel.SMS:
        return this.loadSms(organizationId, nativeConversationId);
      case CommunicationChannel.VOICE:
        return this.loadVoice(organizationId, nativeConversationId);
      default:
        return null;
    }
  }

  private async loadWhatsApp(
    organizationId: string,
    nativeConversationId: string,
  ): Promise<LoadedNativeCommunicationFacts | null> {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: nativeConversationId, organizationId },
      select: {
        customerId: true,
        bookingId: true,
        vehicleId: true,
        assignedTo: true,
        contactPhoneNormalized: true,
      },
    });
    if (!conversation) return null;

    return {
      nativeContext: {
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
        vehicleId: conversation.vehicleId,
        assignedUserId: conversation.assignedTo,
      },
      identityHints: {
        normalizedPhone: conversation.contactPhoneNormalized,
      },
    };
  }

  private async loadSms(
    organizationId: string,
    nativeConversationId: string,
  ): Promise<LoadedNativeCommunicationFacts | null> {
    const conversation = await this.prisma.smsConversation.findFirst({
      where: { id: nativeConversationId, organizationId },
      select: {
        customerId: true,
        bookingId: true,
        vehicleId: true,
        contactPhoneNormalized: true,
      },
    });
    if (!conversation) return null;

    return {
      nativeContext: {
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
        vehicleId: conversation.vehicleId,
      },
      identityHints: {
        normalizedPhone: conversation.contactPhoneNormalized,
      },
    };
  }

  private async loadVoice(
    organizationId: string,
    nativeConversationId: string,
  ): Promise<LoadedNativeCommunicationFacts | null> {
    const conversation = await this.prisma.voiceConversation.findFirst({
      where: { id: nativeConversationId, organizationId },
      select: {
        callerNumber: true,
        providerAgentId: true,
        voiceAssistantId: true,
        metadata: true,
      },
    });
    if (!conversation) return null;

    const metadataContext = readVoiceConversationContext(conversation as any);
    const assignedAgentRef =
      conversation.providerAgentId ?? conversation.voiceAssistantId ?? null;

    return {
      nativeContext: {
        customerId: metadataContext.customerId,
        bookingId: metadataContext.bookingId,
        vehicleId: metadataContext.vehicleId,
        stationId: metadataContext.stationId,
        assignedAgentRef,
        assignedAgentType: assignedAgentRef ? 'VOICE_AGENT' : null,
      },
      identityHints: {
        normalizedPhone: normalizeCommunicationPhone(conversation.callerNumber),
      },
    };
  }
}
