import type { DocumentActionPayload } from './document-action.types';

const OCR_TEXT_KEY_PATTERN =
  /^(rawText|ocrText|fullText|pageText|extractedText|documentText|plainText|markdownText|sourceText)$/i;

const SECRET_KEY_PATTERN =
  /(secret|password|token|apikey|api_key|authorization|bearer|private_key|credential)/i;

const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

/**
 * Minimize stored action payloads — never persist full OCR dumps or secrets.
 */
export function sanitizeDocumentActionPayload(
  payload: DocumentActionPayload | null | undefined,
  depth = 0,
): DocumentActionPayload {
  if (payload == null) return {};
  if (depth > 4) return { _truncated: true };

  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeDocumentActionPayloadValue(item, depth + 1)) as unknown as DocumentActionPayload;
  }

  if (!isPlainObject(payload)) {
    return sanitizeDocumentActionPayloadValue(payload, depth + 1) as DocumentActionPayload;
  }

  const sanitized: DocumentActionPayload = {};
  const entries = Object.entries(payload).slice(0, MAX_OBJECT_KEYS);

  for (const [key, value] of entries) {
    if (OCR_TEXT_KEY_PATTERN.test(key) || SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    sanitized[key] = sanitizeDocumentActionPayloadValue(value, depth + 1);
  }

  return sanitized;
}

function sanitizeDocumentActionPayloadValue(value: unknown, depth: number): unknown {
  if (value == null) return value;

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return sanitizeDocumentActionPayload(value as DocumentActionPayload, depth);
  }

  return truncateString(String(value));
}
