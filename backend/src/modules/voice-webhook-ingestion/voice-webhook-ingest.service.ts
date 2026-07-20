import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, VoiceControlPlaneProvider } from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { VoiceMetricsService } from '@modules/observability/voice-metrics.service';
import { VoiceProviderWebhookEventRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceWebhookCorrelationService } from './voice-webhook-correlation.service';
import { hashWebhookPayload } from './voice-webhook-payload.util';
import { redactTwilioFormPayload, redactWebhookPayload } from './voice-webhook-redaction.util';
import { isVoiceWebhookIngestionEnabled } from './voice-webhook-ingestion.config';
import { VoiceRolloutService } from '@modules/voice-rollout/voice-rollout.service';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

export type VoiceWebhookIngestResult = {
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  queued: boolean;
};

export type VoiceWebhookIngestJobData = {
  eventId: string;
  replay?: boolean;
};

@Injectable()
export class VoiceWebhookQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.VOICE_WEBHOOK_PROCESS)
    private readonly queue: Queue<VoiceWebhookIngestJobData>,
  ) {}

  async enqueue(eventId: string, replay = false): Promise<void> {
    await this.queue.add(
      replay ? 'replay' : 'process',
      { eventId, replay },
      {
        jobId: replay ? `voice-webhook-replay:${eventId}:${Date.now()}` : `voice-webhook:${eventId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 2000, age: 24 * 3600 },
        removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
      },
    );
  }
}

@Injectable()
export class VoiceWebhookIngestService {
  private readonly logger = new Logger(VoiceWebhookIngestService.name);

  constructor(
    private readonly events: VoiceProviderWebhookEventRepository,
    private readonly correlation: VoiceWebhookCorrelationService,
    private readonly queue: VoiceWebhookQueueProducer,
    private readonly rollout: VoiceRolloutService,
    @Optional() private readonly voiceMetrics?: VoiceMetricsService,
  ) {}

  async ingestTwilioEvent(params: {
    organizationId: string | null;
    externalEventId: string;
    eventType: string;
    form: Record<string, string>;
  }): Promise<VoiceWebhookIngestResult> {
    if (!isVoiceWebhookIngestionEnabled()) {
      return { accepted: false, duplicate: false, eventId: '', queued: false };
    }

    const redactedPayload = redactTwilioFormPayload(params.form);
    const payloadHash = hashWebhookPayload(JSON.stringify(redactedPayload));
    const correlationKeys = await this.correlation.resolveFromTwilioForm(
      params.organizationId,
      params.form,
    );

    return this.persistAndQueue({
      organizationId: correlationKeys.organizationId ?? params.organizationId,
      provider: VoiceControlPlaneProvider.TWILIO,
      externalEventId: params.externalEventId,
      eventType: params.eventType,
      payloadHash,
      redactedPayload,
      correlation: correlationKeys,
    });
  }

  async ingestElevenLabsEvent(params: {
    organizationId: string;
    externalEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    rawBody: Buffer;
  }): Promise<VoiceWebhookIngestResult> {
    if (!isVoiceWebhookIngestionEnabled()) {
      return { accepted: false, duplicate: false, eventId: '', queued: false };
    }

    const redactedPayload = redactWebhookPayload(params.payload);
    const payloadHash = hashWebhookPayload(params.rawBody);
    const correlationKeys = await this.correlation.resolveFromElevenLabsPayload(
      params.organizationId,
      params.payload,
    );
    this.correlation.assertOrganizationMatch(params.organizationId, correlationKeys);

    return this.persistAndQueue({
      organizationId: params.organizationId,
      provider: VoiceControlPlaneProvider.ELEVENLABS,
      externalEventId: params.externalEventId,
      eventType: params.eventType,
      payloadHash,
      redactedPayload,
      correlation: correlationKeys,
    });
  }

  async ingestMcpToolExecutionEvent(params: {
    organizationId: string;
    externalEventId: string;
    payload: Record<string, unknown>;
  }): Promise<VoiceWebhookIngestResult> {
    return this.ingestInternalEvent({
      provider: VoiceControlPlaneProvider.MCP,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION,
      ...params,
    });
  }

  async ingestInternalConversationEvent(params: {
    organizationId: string;
    externalEventId: string;
    payload: Record<string, unknown>;
  }): Promise<VoiceWebhookIngestResult> {
    return this.ingestInternalEvent({
      provider: VoiceControlPlaneProvider.INTERNAL,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.INTERNAL_CONVERSATION,
      ...params,
    });
  }

  private async ingestInternalEvent(params: {
    organizationId: string;
    externalEventId: string;
    eventType: string;
    provider: VoiceControlPlaneProvider;
    payload: Record<string, unknown>;
  }): Promise<VoiceWebhookIngestResult> {
    if (!isVoiceWebhookIngestionEnabled()) {
      return { accepted: false, duplicate: false, eventId: '', queued: false };
    }

    const redactedPayload = redactWebhookPayload(params.payload);
    const payloadHash = hashWebhookPayload(JSON.stringify(redactedPayload));
    const correlationKeys = await this.correlation.resolveFromInternalEvent(
      params.organizationId,
      params.payload,
    );
    this.correlation.assertOrganizationMatch(params.organizationId, correlationKeys);

    return this.persistAndQueue({
      organizationId: params.organizationId,
      provider: params.provider,
      externalEventId: params.externalEventId,
      eventType: params.eventType,
      payloadHash,
      redactedPayload,
      correlation: correlationKeys,
    });
  }

  private async persistAndQueue(params: {
    organizationId?: string | null;
    provider: VoiceControlPlaneProvider;
    externalEventId: string;
    eventType: string;
    payloadHash: string;
    redactedPayload: Record<string, unknown>;
    correlation: Awaited<ReturnType<VoiceWebhookCorrelationService['resolveFromTwilioForm']>>;
  }): Promise<VoiceWebhookIngestResult> {
    if (params.organizationId) {
      const rollout = await this.rollout.evaluateSurface(params.organizationId, 'webhooks', {
        skipRuntimePrerequisites: true,
      });
      if (!rollout.allowed) {
        return { accepted: false, duplicate: false, eventId: '', queued: false };
      }
    }

    const { event, created } = await this.events.persistOrGet({
      organizationId: params.organizationId ?? null,
      provider: params.provider,
      externalEventId: params.externalEventId,
      eventType: params.eventType,
      payloadHash: params.payloadHash,
      redactedPayload: params.redactedPayload as Prisma.InputJsonValue,
      correlation: params.correlation,
    });

    if (!created) {
      this.voiceMetrics?.webhookIngest.inc({
        provider: params.provider,
        result: 'duplicate',
      });
      return { accepted: true, duplicate: true, eventId: event.id, queued: false };
    }

    await this.events.markQueued(event.id);
    await this.queue.enqueue(event.id);

    this.voiceMetrics?.webhookIngest.inc({
      provider: params.provider,
      result: 'accepted',
    });

    return { accepted: true, duplicate: false, eventId: event.id, queued: true };
  }
}
