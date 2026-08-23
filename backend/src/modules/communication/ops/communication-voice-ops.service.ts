import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  extractConversationLinks,
  hasConversationTranscript,
  isConversationEscalated,
  maskCallerNumber,
} from '@modules/voice-assistant/voice-conversation.util';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReplyError } from '../reply/communication-reply.errors';
import { parseVoiceTranscript } from './communication-voice-transcript.util';
import type {
  CommunicationVoiceCallDetailDto,
  CommunicationVoiceCallFailureState,
  CommunicationVoiceCallTranscriptDto,
} from './communication-voice-ops.types';

@Injectable()
export class CommunicationVoiceOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly scope: CommunicationWriteScopeService,
  ) {}

  async getVoiceCallDetail(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
  ): Promise<CommunicationVoiceCallDetailDto> {
    const { canonical, native } = await this.requireScopedVoiceCall(
      organizationId,
      conversationId,
      actorUserId,
    );
    return this.mapVoiceCallDetail(canonical.id, native);
  }

  async getVoiceCallTranscript(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
  ): Promise<CommunicationVoiceCallTranscriptDto> {
    const { native } = await this.requireScopedVoiceCall(
      organizationId,
      conversationId,
      actorUserId,
    );

    const parsed = parseVoiceTranscript(native.id, native.transcript, native.startedAt);
    return {
      callId: native.id,
      availability: parsed.availability,
      segments: parsed.segments,
    };
  }

  private async requireScopedVoiceCall(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
  ) {
    const canonical = await this.readRepository.findConversationById(organizationId, conversationId);
    if (!canonical) {
      throw CommunicationReplyError.notFound();
    }
    if (canonical.channel !== CommunicationChannel.VOICE) {
      throw new BadRequestException('Voice operations are only available for voice conversations');
    }

    await this.scope.assertConversationReadable(actorUserId, organizationId, canonical);

    const nativeConversationId = await this.requireNativeConversationId(organizationId, conversationId);

    const native = await this.prisma.voiceConversation.findFirst({
      where: {
        id: nativeConversationId,
        organizationId,
      },
    });

    if (!native) {
      throw new NotFoundException('Voice call not found');
    }

    return { canonical, native };
  }

  private async requireNativeConversationId(
    organizationId: string,
    conversationId: string,
  ): Promise<string> {
    const row = await this.prisma.communicationConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { nativeConversationId: true },
    });
    if (!row?.nativeConversationId) {
      throw new NotFoundException('Voice call not found');
    }
    return row.nativeConversationId;
  }

  private resolveFailureState(native: {
    status: VoiceConversationStatus;
    outcome: VoiceConversationOutcome;
    errorMessage: string | null;
  }): CommunicationVoiceCallFailureState | null {
    if (native.errorMessage?.trim()) return 'CALL_FAILED';
    if (native.status === 'FAILED' || native.outcome === 'FAILED') return 'CALL_FAILED';
    return null;
  }

  private mapVoiceCallDetail(
    conversationId: string,
    native: {
      id: string;
      direction: VoiceConversationDirection;
      status: VoiceConversationStatus;
      outcome: VoiceConversationOutcome;
      startedAt: Date;
      endedAt: Date | null;
      durationSeconds: number | null;
      summary: string | null;
      escalationReason: string | null;
      transcript: string | null;
      errorMessage: string | null;
      callerNumber: string | null;
      metadata: unknown;
    },
  ): CommunicationVoiceCallDetailDto {
    const links = extractConversationLinks(native.metadata);
    const hasTranscript = hasConversationTranscript(native.transcript);
    const transcriptParsed = parseVoiceTranscript(native.id, native.transcript, native.startedAt);

    return {
      callId: native.id,
      conversationId,
      direction: native.direction,
      status: native.status,
      outcome: native.outcome,
      startedAt: native.startedAt.toISOString(),
      endedAt: native.endedAt?.toISOString() ?? null,
      durationSeconds: native.durationSeconds,
      summary: native.summary?.trim() || null,
      summaryAvailable: Boolean(native.summary?.trim()),
      escalationReason: native.escalationReason,
      escalated: isConversationEscalated(native),
      hasTranscript,
      transcriptAvailability: transcriptParsed.availability,
      failureState: this.resolveFailureState(native),
      maskedCallerNumber: maskCallerNumber(native.callerNumber),
      linkedTaskId: links.taskId,
    };
  }
}
