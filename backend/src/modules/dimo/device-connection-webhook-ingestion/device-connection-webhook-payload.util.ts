import { createHash } from 'crypto';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { normalizeDimoWebhookPayload } from '../dimo-webhook-payload.util';
import { DEVICE_CONNECTION_WEBHOOK_MAX_PAYLOAD_BYTES } from './device-connection-webhook-ingestion.constants';

const REDACTED_KEYS = new Set([
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'token',
  'password',
  'privatekey',
  'private_key',
]);

export function hashDeviceConnectionWebhookPayload(raw: Buffer | string): string {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  return createHash('sha256').update(buffer).digest('hex');
}

export function assertDeviceConnectionPayloadWithinLimit(
  raw: Buffer,
  maxBytes = DEVICE_CONNECTION_WEBHOOK_MAX_PAYLOAD_BYTES,
): void {
  if (raw.length > maxBytes) {
    throw new Error(`DEVICE_CONNECTION_PAYLOAD_TOO_LARGE:${raw.length}`);
  }
}

function redactValue(key: string, value: unknown): unknown {
  const normalized = key.trim().toLowerCase();
  if (REDACTED_KEYS.has(normalized)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(String(index), item));
  }
  if (value && typeof value === 'object') {
    return redactDeviceConnectionWebhookPayload(value as Record<string, unknown>);
  }
  return value;
}

/** Strip likely secrets from webhook JSON before persistence. */
export function redactDeviceConnectionWebhookPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Prefer CloudEvent id / webhookId; fall back to deterministic synthetic id.
 */
export function extractDimoDeviceConnectionProviderEventId(
  body: unknown,
  input: {
    tokenId: number | null;
    eventType: DimoDeviceConnectionEventType | null;
    observedAt: Date | null;
    rawPayloadHash: string;
  },
): string {
  const root = asRecord(body);
  if (root) {
    if (typeof root.id === 'string' && root.id.trim()) {
      return root.id.trim();
    }
    const data = asRecord(root.data);
    if (typeof data?.webhookId === 'string' && data.webhookId.trim()) {
      return data.webhookId.trim();
    }
    if (typeof data?.triggerId === 'string' && data.triggerId.trim()) {
      return data.triggerId.trim();
    }
  }

  const normalized = normalizeDimoWebhookPayload(body);
  const observedKey = input.observedAt?.toISOString() ?? normalized.timestamp ?? 'unknown';
  const synthetic = [
    input.tokenId ?? normalized.tokenId ?? 'unknown-token',
    input.eventType ?? normalized.signalName ?? 'unknown-event',
    observedKey,
    input.rawPayloadHash.slice(0, 16),
  ].join('|');
  return `synthetic:${createHash('sha256').update(synthetic).digest('hex').slice(0, 32)}`;
}
