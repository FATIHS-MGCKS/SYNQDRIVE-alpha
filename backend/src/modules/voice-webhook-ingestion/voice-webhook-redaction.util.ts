import { maskCallerNumber } from '@modules/voice-assistant/voice-conversation.util';

const SENSITIVE_KEYS = new Set([
  'from',
  'to',
  'caller',
  'caller_number',
  'callerNumber',
  'phone',
  'phone_number',
  'phoneNumber',
  'transcript',
  'summary',
  'audio',
  'recording_url',
  'recordingUrl',
  'email',
  'name',
  'first_name',
  'last_name',
  'address',
  'document',
  'document_url',
]);

function redactValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();
  if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(normalized)) {
    if (typeof value === 'string' && (normalized.includes('phone') || normalized.includes('caller') || key === 'From' || key === 'To')) {
      return maskCallerNumber(value);
    }
    if (typeof value === 'string' && (normalized.includes('transcript') || normalized.includes('summary'))) {
      return value.length > 0 ? `[redacted:${value.length}chars]` : null;
    }
    if (typeof value === 'string') {
      return value.length > 4 ? `${value.slice(0, 2)}…${value.slice(-2)}` : '[redacted]';
    }
    return '[redacted]';
  }
  return value;
}

export function redactWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactWebhookPayload(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object'
          ? redactWebhookPayload(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = redactValue(key, value);
    }
  }
  return result;
}

export function redactTwilioFormPayload(form: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (key === 'From' || key === 'To' || key === 'Caller') {
      result[key] = maskCallerNumber(value) ?? '[redacted]';
    } else {
      result[key] = value;
    }
  }
  return result;
}
