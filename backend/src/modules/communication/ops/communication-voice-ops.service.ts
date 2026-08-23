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
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskPermissionService } from '@modules/tasks/task-permission.service';
import {
  extractConversationLinks,
  hasConversationTranscript,
  isConversationEscalated,
  maskCallerNumber,
} from '@modules/voice-assistant/voice-conversation.util';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReplyError } from '../reply/communication-reply.errors';
import type { CommunicationReplyActor } from '../reply/communication-reply.service';
import { parseVoiceTranscript } from './communication-voice-transcript.util';
import type {
  CommunicationVoiceCallDetailDto,
  CommunicationVoiceCallTranscriptDto,
  CommunicationVoiceCreateTaskResultDto,
} from './communication-voice-ops.types';
import type { CommunicationVoiceCreateTaskDto } from './dto/communication-voice-create-task.dto';

@Injectable()
export class CommunicationVoiceOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly scope: CommunicationWriteScopeService,
    private readonly tasks: TasksService,
    private readonly taskPermissions: TaskPermissionService,
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

  async createTaskFromCall(
    organizationId: string,
    conversationId: string,
    actor: CommunicationReplyActor,
    body: CommunicationVoiceCreateTaskDto,
  ): Promise<CommunicationVoiceCreateTaskResultDto> {
    const { canonical, native } = await this.requireScopedVoiceCall(
      organizationId,
      conversationId,
      actor.userId,
    );

    await this.taskPermissions.assert({ id: actor.userId }, organizationId, 'tasks.create');

    const links = extractConversationLinks(native.metadata);
    const summary = native.summary?.trim() || null;
    const startedLabel = native.startedAt.toLocaleDateString('de-DE');
    const title =
      body.title?.trim()
      || `Follow-up: Sprachanruf ${startedLabel}`;
    const descriptionParts = [
      summary ? `Zusammenfassung: ${summary}` : null,
      native.escalationReason ? `Eskalation: ${native.escalationReason}` : null,
      `Kommunikation: ${canonical.id}`,
    ].filter(Boolean);

    const description =
      body.description?.trim()
      || descriptionParts.join('\n\n');

    const dedupKey = body.idempotencyKey
      ? `voice:cc-manual:${native.id}:${body.idempotencyKey}`
      : undefined;

    const existing = dedupKey
      ? await this.prisma.orgTask.findFirst({
          where: {
            organizationId,
            dedupKey,
            status: { notIn: ['DONE', 'CANCELLED'] },
          },
          select: { id: true },
        })
      : null;

    if (existing) {
      return { taskId: existing.id, deduped: true };
    }

    const task = await this.tasks.createManualTask(
      organizationId,
      {
        title,
        description,
        type: 'CUSTOMER_FOLLOWUP',
        sourceType: 'MANUAL',
        source: 'MANUAL',
        priority: isConversationEscalated(native) ? 'HIGH' : 'NORMAL',
        customerId: canonical.customerId ?? links.linkedCustomerId ?? undefined,
        bookingId: canonical.bookingId ?? links.linkedBookingId ?? undefined,
        vehicleId: canonical.vehicleId ?? links.linkedVehicleId ?? undefined,
        dedupKey,
        metadata: {
          voiceConversationId: native.id,
          communicationConversationId: canonical.id,
          outcome: native.outcome,
        },
      },
      actor.userId,
    );

    return {
      taskId: (task as { id: string }).id,
      deduped: false,
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
      errorMessage: native.errorMessage,
      maskedCallerNumber: maskCallerNumber(native.callerNumber),
      linkedTaskId: links.taskId,
    };
  }
}
