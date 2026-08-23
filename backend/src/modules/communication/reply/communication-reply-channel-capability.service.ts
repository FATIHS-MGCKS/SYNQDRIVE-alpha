import { Injectable } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppProviderService } from '@modules/whatsapp/providers/whatsapp-provider.service';
import {
  buildSyntheticSmsConfigPublicDto,
  mapOrgSmsConfigToPublicDto,
} from '@modules/sms/sms-config.public';
import { CommunicationReplyError } from './communication-reply.errors';

@Injectable()
export class CommunicationReplyChannelCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappProvider: WhatsAppProviderService,
  ) {}

  /**
   * Provider-neutral preflight — no external HTTP calls.
   * Must run before ownership mutation for deterministically unsupported channels.
   */
  async assertChannelCanReply(organizationId: string, channel: CommunicationChannel): Promise<void> {
    if (channel === CommunicationChannel.VOICE) {
      throw CommunicationReplyError.channelNotReplyable();
    }

    if (channel === CommunicationChannel.SMS) {
      const configRow = await this.prisma.orgSmsConfig.findUnique({
        where: { organizationId },
      });
      const config = configRow
        ? mapOrgSmsConfigToPublicDto(configRow)
        : buildSyntheticSmsConfigPublicDto(organizationId);
      if (!config.isConnected || !config.isActive || !config.credentialsConfigured) {
        throw CommunicationReplyError.channelNotConfigured();
      }
      // C5.2 outbound runtime not wired — explicit unavailable.
      throw CommunicationReplyError.channelNotConfigured();
    }

    if (channel === CommunicationChannel.WHATSAPP) {
      const config = await this.prisma.orgWhatsAppConfig.findUnique({
        where: { organizationId },
      });
      if (!config || !this.whatsappProvider.isConfigured(config)) {
        throw CommunicationReplyError.channelNotConfigured();
      }
      return;
    }

    throw CommunicationReplyError.channelNotReplyable();
  }
}
