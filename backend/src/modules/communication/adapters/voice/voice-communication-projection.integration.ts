import { Injectable, Logger } from '@nestjs/common';
import {
  CommunicationProviderIdentity,
  VoiceControlPlaneProvider,
  VoiceConversation,
  VoiceConversationOutcome,
  VoiceToolExecution,
  VoiceToolExecutionStatus,
} from '@prisma/client';
import { isLegacyTwimlConversation } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { VOICE_WEBHOOK_EVENT_TYPES } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.constants';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationNormalizationError } from '../../normalization/communication-normalization.errors';
import { ElevenLabsVoiceCommunicationAdapter } from './elevenlabs-voice-communication.adapter';
import { TwilioVoiceCommunicationAdapter } from './twilio-voice-communication.adapter';
import {
  buildVoiceTransitionProviderEventId,
  buildVoiceToolProviderEventId,
  resolveNativeTransitionVersion,
} from './voice-communication.shared';
import type {
  ElevenLabsVoiceProjectionSource,
  TwilioVoiceProjectionSource,
  VoiceHumanRequiredProjectionSource,
  VoiceToolExecutionProjectionSource,
} from './voice-communication.types';

@Injectable()
export class VoiceCommunicationProjectionIntegration {
  private readonly logger = new Logger(VoiceCommunicationProjectionIntegration.name);

  constructor(
    private readonly featureFlags: CommunicationProjectionFeatureService,
    private readonly twilioAdapter: TwilioVoiceCommunicationAdapter,
    private readonly elevenLabsAdapter: ElevenLabsVoiceCommunicationAdapter,
    private readonly projection: CommunicationProjectionService,
  ) {}

  isEnabled(organizationId: string): boolean {
    return this.featureFlags.isVoiceProjectionEnabled(organizationId);
  }

  async projectCallStarted(source: TwilioVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.twilioAdapter.fromCallStarted(source));
      },
      this.contextFromConversation(
        source.conversation,
        'CALL_STARTED',
        source.providerEventId,
        CommunicationProviderIdentity.TWILIO,
      ),
    );
  }

  async projectCallConnected(source: TwilioVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.twilioAdapter.fromCallConnected(source));
      },
      this.contextFromConversation(
        source.conversation,
        'CALL_CONNECTED',
        source.providerEventId,
        CommunicationProviderIdentity.TWILIO,
      ),
    );
  }

  async projectCallEnded(source: ElevenLabsVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.elevenLabsAdapter.fromCallEnded(source));
      },
      this.contextFromConversation(
        source.conversation,
        'CALL_ENDED',
        source.providerEventId,
        CommunicationProviderIdentity.ELEVENLABS,
      ),
    );
  }

  async projectTwilioCallEnded(source: TwilioVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.twilioAdapter.fromCallEnded(source));
      },
      this.contextFromConversation(
        source.conversation,
        'CALL_ENDED',
        source.providerEventId,
        CommunicationProviderIdentity.TWILIO,
      ),
    );
  }

  async projectCallFailed(source: TwilioVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.twilioAdapter.fromCallFailed(source));
      },
      this.contextFromConversation(
        source.conversation,
        'CALL_FAILED',
        source.providerEventId,
        CommunicationProviderIdentity.TWILIO,
      ),
    );
  }

  async projectAiIntent(source: ElevenLabsVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(this.elevenLabsAdapter.fromAiIntentDetected(source));
      },
      this.contextFromConversation(
        source.conversation,
        'AI_INTENT_DETECTED',
        source.providerEventId,
        CommunicationProviderIdentity.ELEVENLABS,
      ),
    );
  }

  async projectConversationResolved(source: ElevenLabsVoiceProjectionSource): Promise<void> {
    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(
          this.elevenLabsAdapter.fromConversationResolved(source),
        );
      },
      this.contextFromConversation(
        source.conversation,
        'CONVERSATION_RESOLVED',
        source.providerEventId.endsWith(':resolved')
          ? source.providerEventId
          : `${source.providerEventId}:resolved`,
        CommunicationProviderIdentity.ELEVENLABS,
      ),
    );
  }

  async projectHumanRequired(source: VoiceHumanRequiredProjectionSource): Promise<void> {
    const providerEventId =
      source.providerEventId.trim() ||
      buildVoiceTransitionProviderEventId('voice-human', source.conversation);
    const providerIdentity =
      source.providerIdentity === 'TWILIO'
        ? CommunicationProviderIdentity.TWILIO
        : CommunicationProviderIdentity.ELEVENLABS;

    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(
          this.elevenLabsAdapter.fromHumanRequired({ ...source, providerEventId }),
        );
      },
      this.contextFromConversation(
        source.conversation,
        'HUMAN_REQUIRED',
        providerEventId,
        providerIdentity,
      ),
    );
  }

  async projectToolExecution(source: VoiceToolExecutionProjectionSource): Promise<void> {
    const eventType =
      source.execution.status === VoiceToolExecutionStatus.RUNNING
        ? 'AI_ACTION_STARTED'
        : source.execution.status === VoiceToolExecutionStatus.SUCCEEDED
          ? 'AI_ACTION_COMPLETED'
          : 'AI_ACTION_FAILED';
    const providerEventId = buildVoiceToolProviderEventId(source.execution.id, eventType);

    await this.projectSafely(
      async () => {
        if (!this.isEnabled(source.conversation.organizationId)) return;
        await this.projection.projectNormalizedInput(
          this.elevenLabsAdapter.normalizeAiAction(source),
        );
      },
      this.contextFromConversation(
        source.conversation,
        eventType,
        providerEventId,
        CommunicationProviderIdentity.ELEVENLABS,
      ),
    );
  }

  /**
   * Dispatch canonical projection from a processed voice webhook event + persisted conversation.
   */
  async projectFromProcessedWebhook(params: {
    organizationId: string;
    eventType: string;
    externalEventId: string;
    provider: VoiceControlPlaneProvider;
    conversation: VoiceConversation;
    payload: Record<string, unknown>;
    conversationCreated?: boolean;
  }): Promise<void> {
    const { conversation, eventType, externalEventId, payload } = params;
    const occurredAt = conversation.updatedAt ?? conversation.startedAt ?? new Date();

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.TWILIO_VOICE_INBOUND) {
      await this.projectCallStarted({
        conversation,
        providerEventId: externalEventId,
        occurredAt,
        telephonyStatusCode: 'inbound',
        includeInitialStatus: true,
      });
      return;
    }

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.TWILIO_STATUS) {
      const callStatus = String(payload.CallStatus ?? '').toLowerCase();
      const twilioBase = {
        conversation,
        providerEventId: externalEventId,
        occurredAt,
        telephonyStatusCode: callStatus,
        durationSeconds: parseDuration(payload.CallDuration),
      } satisfies TwilioVoiceProjectionSource;

      if (callStatus === 'in-progress' || callStatus === 'answered') {
        await this.projectCallConnected(twilioBase);
        return;
      }

      if (['busy', 'no-answer', 'failed', 'canceled', 'cancelled'].includes(callStatus)) {
        await this.projectCallFailed({
          ...twilioBase,
          failureCode: callStatus.toUpperCase(),
          outcomeCode: conversation.outcome,
        });
        return;
      }

      if (callStatus === 'completed') {
        if (isLegacyTwimlConversation(conversation.metadata)) {
          await this.projectTwilioCallEnded({
            conversation,
            providerEventId: externalEventId,
            occurredAt,
            durationSeconds: conversation.durationSeconds,
            outcomeCode: conversation.outcome,
            telephonyStatusCode: callStatus,
          });
        }
        return;
      }

      // initiated / ringing / queued are provider sub-states; CALL_STARTED is emitted only
      // from inbound accept or outbound provider acceptance (authoritative milestones).
      return;
    }

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_CONVERSATION) {
      // Active ElevenLabs session status is not a deterministic intent signal — deferred to C11.
      return;
    }

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_POST_CALL) {
      const endedSource: ElevenLabsVoiceProjectionSource = {
        conversation,
        providerEventId: `${externalEventId}:ended`,
        occurredAt,
        durationSeconds: conversation.durationSeconds,
        outcomeCode: conversation.outcome,
      };
      await this.projectCallEnded(endedSource);

      if (conversation.outcome === VoiceConversationOutcome.RESOLVED) {
        await this.projectConversationResolved({
          ...endedSource,
          providerEventId: `${externalEventId}:resolved`,
        });
      }
      return;
    }

    if (eventType === VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION) {
      const toolExecutionId = readString(payload, 'toolExecutionId');
      const toolName = readString(payload, 'toolName') ?? 'unknown_tool';
      const status = readString(payload, 'status') ?? 'SUCCEEDED';
      if (!toolExecutionId) return;

      const syntheticExecution = {
        id: toolExecutionId,
        organizationId: conversation.organizationId,
        voiceConversationId: conversation.id,
        toolName,
        status: status === 'FAILED' ? VoiceToolExecutionStatus.FAILED : VoiceToolExecutionStatus.SUCCEEDED,
        riskClass: 'READ_ONLY',
        requestHash: 'replay',
        idempotencyKey: `${conversation.id}:${toolExecutionId}`,
        redactedInput: null,
        redactedOutput: null,
        errorCode: status === 'FAILED' ? 'TOOL_FAILED' : null,
        errorMessage: null,
        durationMs: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      } as VoiceToolExecution;

      await this.projectToolExecution({
        conversation,
        execution: syntheticExecution,
        occurredAt,
      });
    }
  }

  async projectEscalationTransition(
    conversation: VoiceConversation,
    handoffReasonCode: string,
    priorEscalationReason: string | null,
  ): Promise<void> {
    if (priorEscalationReason?.trim()) {
      return;
    }
    await this.projectHumanRequired({
      conversation,
      providerEventId: buildVoiceTransitionProviderEventId('voice-human', conversation),
      occurredAt: conversation.updatedAt,
      handoffReasonCode,
      providerIdentity: 'ELEVENLABS',
    });
  }

  private contextFromConversation(
    conversation: VoiceConversation,
    eventType: string,
    providerEventId: string,
    providerIdentity: CommunicationProviderIdentity,
  ) {
    return {
      organizationId: conversation.organizationId,
      nativeConversationId: conversation.id,
      providerIdentity,
      providerEventId,
      eventType,
    };
  }

  private async projectSafely(
    operation: () => Promise<void>,
    context: {
      organizationId: string;
      nativeConversationId: string;
      providerIdentity: CommunicationProviderIdentity;
      providerEventId: string;
      eventType: string;
    },
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const errorCode =
        error instanceof CommunicationNormalizationError ? error.code : 'PROJECTION_FAILURE';
      this.logger.warn(
        JSON.stringify({
          msg: 'voice_canonical_projection_failed',
          organizationId: context.organizationId,
          channel: 'VOICE',
          nativeConversationId: context.nativeConversationId,
          providerIdentity: context.providerIdentity,
          providerEventId: context.providerEventId,
          eventType: context.eventType,
          errorCode,
        }),
      );
    }
  }
}

function parseDuration(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNestedString(payload: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = payload;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}