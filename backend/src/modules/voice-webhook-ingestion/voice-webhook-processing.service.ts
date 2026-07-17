import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { VoiceWebhookErrorClass } from '@prisma/client';
import { VoiceProviderWebhookEventRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceConversationLifecycleService } from './voice-conversation-lifecycle.service';
import { VoiceWebhookCorrelationService } from './voice-webhook-correlation.service';
import { VoiceWebhookQueueProducer } from './voice-webhook-ingest.service';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

const MAX_PROCESSING_RETRIES = 5;

@Injectable()
export class VoiceWebhookProcessingService {
  private readonly logger = new Logger(VoiceWebhookProcessingService.name);

  constructor(
    private readonly events: VoiceProviderWebhookEventRepository,
    private readonly lifecycle: VoiceConversationLifecycleService,
    private readonly correlation: VoiceWebhookCorrelationService,
    private readonly queue: VoiceWebhookQueueProducer,
  ) {}

  async processEventId(eventId: string, replay = false): Promise<void> {
    const event = await this.events.findById(eventId);
    if (!event) {
      throw new NotFoundException(`Voice webhook event ${eventId} not found`);
    }

    if (!replay && event.status === 'PROCESSED') {
      return;
    }

    const redactedPayload =
      event.redactedPayload &&
      typeof event.redactedPayload === 'object' &&
      !Array.isArray(event.redactedPayload)
        ? (event.redactedPayload as Record<string, unknown>)
        : {};

    try {
      const correlation = await this.resolveCorrelation(event.organizationId, event.eventType ?? '', redactedPayload, {
        voiceConversationId: event.voiceConversationId,
        twilioCallSid: event.twilioCallSid,
        elevenLabsConversationId: event.elevenLabsConversationId,
        agentDeploymentId: event.agentDeploymentId,
        phoneNumberId: event.phoneNumberId,
        customerId: event.customerId,
        bookingId: event.bookingId,
        organizationId: event.organizationId,
      });

      if (event.organizationId && correlation.organizationId) {
        this.correlation.assertOrganizationMatch(event.organizationId, correlation);
      }

      await this.events.updateCorrelation(event.id, correlation);

      const lifecycleResult = await this.lifecycle.applyWebhookEvent({
        eventType: event.eventType ?? 'unknown',
        correlation,
        redactedPayload,
      });

      if (lifecycleResult.conversationId && !correlation.voiceConversationId) {
        await this.events.updateCorrelation(event.id, {
          ...correlation,
          voiceConversationId: lifecycleResult.conversationId,
        });
      }

      await this.events.markProcessed(event.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown processing error';
      const errorClass = this.classifyError(err);
      const nextRetryCount = event.retryCount + 1;

      if (errorClass === VoiceWebhookErrorClass.POISON || nextRetryCount >= MAX_PROCESSING_RETRIES) {
        await this.events.markDeadLetter(event.id, {
          errorClass,
          errorCode: errorClass,
          errorMessage: message,
        });
        this.logger.error(`Voice webhook event ${eventId} moved to dead letter: ${message}`);
        return;
      }

      await this.events.markFailed(event.id, {
        errorClass,
        errorCode: errorClass,
        errorMessage: message,
        incrementRetry: true,
      });
      throw err;
    }
  }

  private async resolveCorrelation(
    organizationId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
    stored: {
      organizationId: string | null;
      voiceConversationId: string | null;
      twilioCallSid: string | null;
      elevenLabsConversationId: string | null;
      agentDeploymentId: string | null;
      phoneNumberId: string | null;
      customerId: string | null;
      bookingId: string | null;
    },
  ) {
    if (eventType.startsWith('twilio.')) {
      const form = Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, String(value ?? '')]),
      ) as Record<string, string>;
      const resolved = await this.correlation.resolveFromTwilioForm(organizationId, form);
      return { ...stored, ...resolved };
    }
    if (eventType.startsWith('elevenlabs.') && organizationId) {
      const resolved = await this.correlation.resolveFromElevenLabsPayload(organizationId, payload);
      return { ...stored, ...resolved };
    }
    if (
      (eventType === VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION ||
        eventType === VOICE_WEBHOOK_EVENT_TYPES.INTERNAL_CONVERSATION) &&
      organizationId
    ) {
      const resolved = await this.correlation.resolveFromInternalEvent(organizationId, payload);
      return { ...stored, ...resolved };
    }
    return stored;
  }

  private classifyError(err: unknown): VoiceWebhookErrorClass {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Cross-tenant')) {
      return VoiceWebhookErrorClass.TENANT_MISMATCH;
    }
    if (message.includes('correlation')) {
      return VoiceWebhookErrorClass.CORRELATION_MISSING;
    }
    if (message.includes('poison')) {
      return VoiceWebhookErrorClass.POISON;
    }
    return VoiceWebhookErrorClass.DOMAIN_ERROR;
  }
}

@Injectable()
export class VoiceWebhookReplayService {
  constructor(
    private readonly events: VoiceProviderWebhookEventRepository,
    private readonly queue: VoiceWebhookQueueProducer,
  ) {}

  async replayForOrganization(organizationId: string, eventId: string): Promise<{ queued: boolean }> {
    const event = await this.events.findByIdForOrganization(organizationId, eventId);
    if (!event) {
      throw new NotFoundException('Voice webhook event not found for organization');
    }
    await this.queue.enqueue(event.id, true);
    return { queued: true };
  }
}
