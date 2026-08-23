import { Injectable } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSyntheticSmsConfigPublicDto,
  mapOrgSmsConfigToPublicDto,
} from '@modules/sms/sms-config.public';
import { CommunicationReplyError } from '../communication-reply.errors';
import type {
  CommunicationOutboundChannelPort,
  CommunicationOutboundSendInput,
  CommunicationOutboundSendResult,
} from '../ports/communication-outbound-channel.port';

@Injectable()
export class SmsCommunicationOutboundAdapter implements CommunicationOutboundChannelPort {
  readonly channel = CommunicationChannel.SMS;

  constructor(private readonly prisma: PrismaService) {}

  async sendMediaReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult> {
    throw CommunicationReplyError.mediaNotSupported();
  }

  async sendTextReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult> {
    throw CommunicationReplyError.channelNotConfigured();
  }

  async sendTemplateReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult> {
    throw CommunicationReplyError.templateNotSupported();
  }
}
