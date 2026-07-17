import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { Request } from 'express';
import { VoiceMetricsService } from '@modules/observability/voice-metrics.service';
import { VoiceWebhookIngestService } from './voice-webhook-ingest.service';
import { validateElevenLabsWebhookSignature } from './elevenlabs-signature.util';
import { parseJsonPayload, VoiceWebhookPayloadError } from './voice-webhook-payload.util';
import { resolveElevenLabsWebhookSecret } from './voice-webhook-ingestion.config';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

@Controller('webhooks/elevenlabs')
export class ElevenLabsWebhookController {
  private readonly logger = new Logger(ElevenLabsWebhookController.name);

  constructor(
    private readonly ingest: VoiceWebhookIngestService,
    @Optional() private readonly voiceMetrics?: VoiceMetricsService,
  ) {}

  @Post('post-call/:orgId')
  @HttpCode(200)
  async postCall(
    @Param('orgId') orgId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() _body: unknown,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    this.assertSignature(rawBody, req);

    const payload = parseJsonPayload(rawBody);
    const externalEventId = this.resolveExternalEventId(payload, 'post-call', orgId);
    const result = await this.ingest.ingestElevenLabsEvent({
      organizationId: orgId,
      externalEventId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_POST_CALL,
      payload,
      rawBody,
    });

    return { success: true, duplicate: result.duplicate, eventId: result.eventId };
  }

  @Post('conversation/:orgId')
  @HttpCode(200)
  async conversationEvent(
    @Param('orgId') orgId: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() _body: unknown,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    this.assertSignature(rawBody, req);

    const payload = parseJsonPayload(rawBody);
    const externalEventId = this.resolveExternalEventId(payload, 'conversation', orgId);
    const result = await this.ingest.ingestElevenLabsEvent({
      organizationId: orgId,
      externalEventId,
      eventType: VOICE_WEBHOOK_EVENT_TYPES.ELEVENLABS_CONVERSATION,
      payload,
      rawBody,
    });

    return { success: true, duplicate: result.duplicate, eventId: result.eventId };
  }

  private assertSignature(rawBody: Buffer, req: Request): void {
    const secret = resolveElevenLabsWebhookSecret();
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('ElevenLabs webhook signing is not configured');
      }
      return;
    }

    const signatureHeader = req.headers['elevenlabs-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const valid = validateElevenLabsWebhookSignature({
      rawBody,
      signatureHeader: signature,
      secret,
    });

    if (!valid) {
      this.voiceMetrics?.webhookSignatureInvalid.inc({ provider: 'ELEVENLABS' });
      throw new UnauthorizedException('Invalid ElevenLabs webhook signature');
    }
  }

  private resolveExternalEventId(
    payload: Record<string, unknown>,
    channel: string,
    orgId: string,
  ): string {
    const conversationId =
      (typeof payload.conversation_id === 'string' && payload.conversation_id) ||
      (typeof payload.conversationId === 'string' && payload.conversationId) ||
      (payload.data &&
        typeof payload.data === 'object' &&
        !Array.isArray(payload.data) &&
        typeof (payload.data as Record<string, unknown>).conversation_id === 'string' &&
        (payload.data as Record<string, unknown>).conversation_id) ||
      'unknown';

    const eventId =
      (typeof payload.event_id === 'string' && payload.event_id) ||
      (typeof payload.id === 'string' && payload.id) ||
      `${conversationId}:${channel}:${Date.now()}`;

    return `${orgId}:${eventId}`;
  }
}

export { VoiceWebhookPayloadError };
