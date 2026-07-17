import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoiceControlPlaneProvider,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceUsageLedgerService } from '@modules/voice-billing/voice-usage-ledger.service';
import { isLegacyTwimlConversation, buildElevenLabsConversationMetadata, preferDurationSeconds, resolveElevenLabsSyncOutcome } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { hasConversationTranscript } from '@modules/voice-assistant/voice-conversation.util';
import {
  canAdvanceLifecycleState,
  mapElevenLabsConversationStatus,
  mapElevenLabsPostCallLifecycle,
  mapPostCallFinalizedLifecycle,
  mapTwilioCallStatusToLifecycle,
} from './voice-conversation-lifecycle-state.util';
import type { VoiceWebhookCorrelationKeys } from './voice-webhook-correlation.service';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

@Injectable()
export class VoiceConversationLifecycleService {
  private readonly logger = new Logger(VoiceConversationLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageLedger: VoiceUsageLedgerService,
  ) {}

  async applyWebhookEvent(params: {
    eventType: string;
    correlation: VoiceWebhookCorrelationKeys;
    redactedPayload: Record<string, unknown>;
  }): Promise<{ conversationId: string | null; lifecycleState: VoiceConversationLifecycleState | null }> {
    const { eventType, correlation, redactedPayload } = params;
    if (!correlation.organizationId) {
      return { conversationId: null, lifecycleState: null };
    }

    if (eventType.startsWith('twilio.')) {
      return this.applyTwilioEvent(correlation, redactedPayload);
    }
    if (eventType.startsWith('elevenlabs.')) {
      return this.applyElevenLabsEvent(eventType, correlation, redactedPayload);
    }
    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION) {
      return this.applyInternalToolEvent(correlation);
    }
    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.INTERNAL_CONVERSATION) {
      return this.applyInternalConversationEvent(correlation, redactedPayload);
    }

    return { conversationId: correlation.voiceConversationId ?? null, lifecycleState: null };
  }

  private async applyTwilioEvent(
    correlation: VoiceWebhookCorrelationKeys,
    payload: Record<string, unknown>,
  ) {
    const callStatus = typeof payload.CallStatus === 'string' ? payload.CallStatus : '';
    const lifecycleTarget = mapTwilioCallStatusToLifecycle(callStatus);
    const callSid = correlation.twilioCallSid ?? (typeof payload.CallSid === 'string' ? payload.CallSid : null);

    let conversation = correlation.voiceConversationId
      ? await this.prisma.voiceConversation.findFirst({
          where: { id: correlation.voiceConversationId, organizationId: correlation.organizationId! },
        })
      : null;

    if (!conversation && callSid) {
      conversation = await this.prisma.voiceConversation.findFirst({
        where: { organizationId: correlation.organizationId!, twilioCallSid: callSid },
      });
    }

    if (!conversation) {
      return { conversationId: null, lifecycleState: lifecycleTarget };
    }

    const update: Prisma.VoiceConversationUpdateInput = {
      metadata: this.mergeMetadata(conversation.metadata, {
        twilioCallStatus: callStatus,
        lifecycleSource: 'twilio',
      }),
    };

    if (lifecycleTarget && canAdvanceLifecycleState(conversation.lifecycleState, lifecycleTarget)) {
      update.lifecycleState = lifecycleTarget;
    }

    const duration = typeof payload.CallDuration === 'string' ? parseInt(payload.CallDuration, 10) : null;
    if (duration && Number.isFinite(duration) && duration > 0) {
      update.durationSeconds = preferDurationSeconds(conversation.durationSeconds, duration, 'twilio');
    }

    const terminal = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled', 'cancelled']);
    const nativeConversation = !isLegacyTwimlConversation(conversation.metadata);

    if (terminal.has(callStatus.toLowerCase())) {
      if (nativeConversation) {
        if (callStatus.toLowerCase() === 'failed') {
          update.outcome = VoiceConversationOutcome.FAILED;
        } else if (
          callStatus.toLowerCase() === 'no-answer' ||
          callStatus.toLowerCase() === 'busy'
        ) {
          update.outcome = VoiceConversationOutcome.ABANDONED;
        }
        if (callStatus.toLowerCase() === 'completed') {
          update.status = VoiceConversationStatus.COMPLETED;
          update.endedAt = new Date();
        }
      } else {
        update.status = VoiceConversationStatus.COMPLETED;
        update.endedAt = new Date();
        if (callStatus.toLowerCase() === 'failed') {
          update.outcome = VoiceConversationOutcome.FAILED;
        } else if (callStatus.toLowerCase() === 'no-answer' || callStatus.toLowerCase() === 'busy') {
          update.outcome = VoiceConversationOutcome.ABANDONED;
        }
      }
    }

    const updated = await this.prisma.voiceConversation.update({
      where: { id: conversation.id },
      data: update,
    });

    await this.recordMeteredUsageIfApplicable(updated);

    return { conversationId: updated.id, lifecycleState: updated.lifecycleState };
  }

  private async applyElevenLabsEvent(
    eventType: string,
    correlation: VoiceWebhookCorrelationKeys,
    payload: Record<string, unknown>,
  ) {
    const conversation = await this.ensureElevenLabsConversation(correlation, payload);
    if (!conversation) {
      return { conversationId: null, lifecycleState: null };
    }

    const remoteStatus =
      this.readString(payload, 'status') ||
      this.readNestedString(payload, ['data', 'status']) ||
      'done';

    let lifecycleTarget: VoiceConversationLifecycleState | null = null;
    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_POST_CALL) {
      lifecycleTarget = mapElevenLabsPostCallLifecycle();
    } else {
      lifecycleTarget = mapElevenLabsConversationStatus(remoteStatus);
    }

    const transcript =
      this.readString(payload, 'transcript') ||
      this.readNestedString(payload, ['data', 'transcript']);
    const summary =
      this.readString(payload, 'summary') ||
      this.readNestedString(payload, ['data', 'analysis', 'summary']);

    const update: Prisma.VoiceConversationUpdateInput = {
      metadata: this.mergeMetadata(conversation.metadata, {
        elevenLabsStatus: remoteStatus,
        lifecycleSource: 'elevenlabs',
      }),
    };

    if (correlation.elevenLabsConversationId) {
      update.elevenLabsConvId = correlation.elevenLabsConversationId;
      update.providerConversationId = correlation.elevenLabsConversationId;
    }

    if (lifecycleTarget && canAdvanceLifecycleState(conversation.lifecycleState, lifecycleTarget)) {
      update.lifecycleState = lifecycleTarget;
    }

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_POST_CALL) {
      if (transcript) {
        update.transcript = transcript;
      }
      if (summary) {
        update.summary = summary;
      }
      update.status = VoiceConversationStatus.COMPLETED;
      update.endedAt = new Date();
      update.outcome = resolveElevenLabsSyncOutcome({
        remoteStatus: remoteStatus === 'done' ? 'done' : remoteStatus,
        transcript: transcript ?? conversation.transcript,
      });

      const finalized = mapPostCallFinalizedLifecycle();
      if (canAdvanceLifecycleState(
        lifecycleTarget ?? conversation.lifecycleState,
        finalized,
      )) {
        update.lifecycleState = finalized;
      } else if (!update.lifecycleState) {
        update.lifecycleState = finalized;
      }
    } else if (hasConversationTranscript(transcript)) {
      update.transcript = transcript;
    }

    const duration =
      this.readNumber(payload, 'call_duration_secs') ??
      this.readNestedNumber(payload, ['data', 'metadata', 'call_duration_secs']);
    if (duration && duration > 0) {
      update.durationSeconds = preferDurationSeconds(conversation.durationSeconds, duration, 'elevenlabs');
    }

    const updated = await this.prisma.voiceConversation.update({
      where: { id: conversation.id },
      data: update,
    });

    await this.recordMeteredUsageIfApplicable(updated);

    return { conversationId: updated.id, lifecycleState: updated.lifecycleState };
  }

  private async applyInternalToolEvent(correlation: VoiceWebhookCorrelationKeys) {
    if (!correlation.voiceConversationId || !correlation.organizationId) {
      return { conversationId: null, lifecycleState: null };
    }
    const conversation = await this.prisma.voiceConversation.findFirst({
      where: { id: correlation.voiceConversationId, organizationId: correlation.organizationId },
    });
    if (!conversation) {
      return { conversationId: null, lifecycleState: null };
    }
    const target = VoiceConversationLifecycleState.AI_ACTIVE;
    if (!canAdvanceLifecycleState(conversation.lifecycleState, target)) {
      return { conversationId: conversation.id, lifecycleState: conversation.lifecycleState };
    }
    const updated = await this.prisma.voiceConversation.update({
      where: { id: conversation.id },
      data: { lifecycleState: target },
    });
    return { conversationId: updated.id, lifecycleState: updated.lifecycleState };
  }

  private async applyInternalConversationEvent(
    correlation: VoiceWebhookCorrelationKeys,
    payload: Record<string, unknown>,
  ) {
    if (!correlation.voiceConversationId || !correlation.organizationId) {
      return { conversationId: null, lifecycleState: null };
    }
    const lifecycleHint = this.readString(payload, 'lifecycleState') as VoiceConversationLifecycleState | null;
    const conversation = await this.prisma.voiceConversation.findFirst({
      where: { id: correlation.voiceConversationId, organizationId: correlation.organizationId },
    });
    if (!conversation || !lifecycleHint) {
      return { conversationId: conversation?.id ?? null, lifecycleState: null };
    }
    if (!canAdvanceLifecycleState(conversation.lifecycleState, lifecycleHint)) {
      return { conversationId: conversation.id, lifecycleState: conversation.lifecycleState };
    }
    const updated = await this.prisma.voiceConversation.update({
      where: { id: conversation.id },
      data: { lifecycleState: lifecycleHint },
    });
    return { conversationId: updated.id, lifecycleState: updated.lifecycleState };
  }

  private async ensureElevenLabsConversation(
    correlation: VoiceWebhookCorrelationKeys,
    payload: Record<string, unknown>,
  ) {
    if (!correlation.organizationId) {
      return null;
    }
    if (correlation.voiceConversationId) {
      return this.prisma.voiceConversation.findFirst({
        where: { id: correlation.voiceConversationId, organizationId: correlation.organizationId },
      });
    }

    const elevenLabsId = correlation.elevenLabsConversationId;
    if (!elevenLabsId) {
      return null;
    }

    const existing = await this.prisma.voiceConversation.findFirst({
      where: { organizationId: correlation.organizationId, elevenLabsConvId: elevenLabsId },
    });
    if (existing) {
      return existing;
    }

    const assistant = correlation.agentDeploymentId
      ? await this.prisma.voiceAgentDeployment.findFirst({
          where: { id: correlation.agentDeploymentId, organizationId: correlation.organizationId },
          select: { voiceAssistantId: true },
        })
      : null;

    return this.prisma.voiceConversation.create({
      data: {
        organizationId: correlation.organizationId,
        voiceAssistantId: assistant?.voiceAssistantId ?? null,
        elevenLabsConvId: elevenLabsId,
        providerConversationId: elevenLabsId,
        twilioCallSid: correlation.twilioCallSid,
        lifecycleState: VoiceConversationLifecycleState.CREATED,
        status: VoiceConversationStatus.ACTIVE,
        outcome: VoiceConversationOutcome.PENDING,
        metadata: buildElevenLabsConversationMetadata({
          source: 'elevenlabs_webhook',
        }),
      },
    });
  }

  private mergeMetadata(existing: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    return { ...base, ...patch } as Prisma.InputJsonValue;
  }

  private readString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readNumber(payload: Record<string, unknown>, key: string): number | null {
    const value = payload[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readNestedString(payload: Record<string, unknown>, path: string[]): string | null {
    let current: unknown = payload;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.trim() ? current.trim() : null;
  }

  private readNestedNumber(payload: Record<string, unknown>, path: string[]): number | null {
    let current: unknown = payload;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
      current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'number' && Number.isFinite(current) ? current : null;
  }

  private async recordMeteredUsageIfApplicable(conversation: {
    id: string;
    organizationId: string;
    direction: import('@prisma/client').VoiceConversationDirection;
    durationSeconds: number | null;
    status: VoiceConversationStatus;
    twilioCallSid: string | null;
    elevenLabsConvId: string | null;
  }) {
    if (conversation.status !== VoiceConversationStatus.COMPLETED) {
      return;
    }
    if (!conversation.durationSeconds || conversation.durationSeconds <= 0) {
      return;
    }

    try {
      await this.usageLedger.recordConversationUsage({
        organizationId: conversation.organizationId,
        voiceConversationId: conversation.id,
        direction: conversation.direction,
        durationSeconds: conversation.durationSeconds,
        provider: VoiceControlPlaneProvider.TWILIO,
        externalUsageRef: conversation.twilioCallSid ?? conversation.elevenLabsConvId,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record voice usage for conversation ${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
