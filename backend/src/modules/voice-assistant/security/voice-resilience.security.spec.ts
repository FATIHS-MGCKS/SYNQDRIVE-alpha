import { VoiceWebhookIngestService } from '@modules/voice-webhook-ingestion/voice-webhook-ingest.service';
import { VoiceMcpRateLimitService } from '@modules/voice-mcp-gateway/voice-mcp-rate-limit.service';

describe('Voice resilience behavior', () => {
  it('treats duplicate webhook idempotency keys as accepted duplicates', async () => {
    const events = {
      persistOrGet: jest.fn().mockResolvedValue({
        event: { id: 'evt-1' },
        created: false,
      }),
    };
    const correlation = {
      resolveFromTwilioForm: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    };
    const queue = { enqueue: jest.fn() };
    const metrics = { webhookIngest: { inc: jest.fn() } };

    const ingest = new VoiceWebhookIngestService(
      events as never,
      correlation as never,
      queue as never,
      metrics as never,
    );

    process.env.VOICE_WEBHOOK_INGESTION_ENABLED = 'true';
    const result = await ingest.ingestTwilioEvent({
      organizationId: 'org-1',
      externalEventId: 'ext-1',
      eventType: 'twilio.status',
      form: { CallSid: 'CA1', From: '+491701234567', To: '+49800900' },
    });

    expect(result.duplicate).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(metrics.webhookIngest.inc).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'duplicate' }),
    );
  });

  it('surfaces MCP rate-limit errors without leaking tenant details', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(200),
      expire: jest.fn(),
    };
    const service = new VoiceMcpRateLimitService(redis as never);
    await expect(service.assertWithinLimit('org-secret')).rejects.toMatchObject({
      code: 'RateLimited',
    });
  });
});
