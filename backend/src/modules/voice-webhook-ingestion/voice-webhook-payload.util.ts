import { createHash } from 'crypto';
import { VOICE_WEBHOOK_MAX_PAYLOAD_BYTES } from './voice-webhook-ingestion.constants';

export class VoiceWebhookPayloadError extends Error {
  constructor(
    message: string,
    readonly code: 'PAYLOAD_TOO_LARGE' | 'PAYLOAD_INVALID',
  ) {
    super(message);
    this.name = 'VoiceWebhookPayloadError';
  }
}

export function hashWebhookPayload(raw: Buffer | string): string {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  return createHash('sha256').update(buffer).digest('hex');
}

export function assertPayloadWithinLimit(raw: Buffer, maxBytes = VOICE_WEBHOOK_MAX_PAYLOAD_BYTES): void {
  if (raw.length > maxBytes) {
    throw new VoiceWebhookPayloadError(
      `Webhook payload exceeds ${maxBytes} bytes`,
      'PAYLOAD_TOO_LARGE',
    );
  }
}

export function parseJsonPayload(raw: Buffer): Record<string, unknown> {
  assertPayloadWithinLimit(raw);
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new VoiceWebhookPayloadError('Webhook payload must be a JSON object', 'PAYLOAD_INVALID');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof VoiceWebhookPayloadError) {
      throw err;
    }
    throw new VoiceWebhookPayloadError('Invalid JSON webhook payload', 'PAYLOAD_INVALID');
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}
