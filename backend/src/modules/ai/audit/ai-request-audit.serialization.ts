import { createHmac } from 'node:crypto';
import { sanitizeAiDomainDiagnosticText } from '../evidence/ai-domain-error.serialization';

const BEARER_PATTERN = /Bearer\s+\S+/gi;

/** Control chars and newlines that could break log pipelines or enable injection. */
const LOG_INJECTION_PATTERN = /[\r\n\x00-\x1f\x7f]/g;

const COORDINATE_PAIR_PATTERN =
  /\b-?\d{1,2}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}\b/g;
const LAT_LNG_KEY_PATTERN =
  /"(?:latitude|longitude|lat|lng|lon)"\s*:\s*-?\d{1,3}\.\d+/gi;

const FORBIDDEN_AUDIT_SUBSTRINGS = [
  'bearer ',
  'api_key',
  'api-key',
  'password=',
  'secret=',
  'connection_string',
  'database_url',
] as const;

/**
 * Sanitize a scalar before structured logging or DB persistence.
 * Strips control chars, truncates length, and redacts obvious secret patterns.
 */
export function sanitizeAuditScalar(value: string, maxLen = 200): string {
  let text = value
    .replace(LOG_INJECTION_PATTERN, ' ')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]');

  text = sanitizeAiDomainDiagnosticText(text);
  return text.trim().slice(0, maxLen);
}

/** Redact coordinate pairs from diagnostic strings — never store in normal audit logs. */
export function redactCoordinatesFromAuditText(text: string): string {
  return text
    .replace(COORDINATE_PAIR_PATTERN, '[REDACTED_COORD]')
    .replace(LAT_LNG_KEY_PATTERN, '"[REDACTED_COORD]"');
}

export function redactVehicleRefForAudit(input: {
  displayName?: string | null;
  licensePlate?: string | null;
}): { displayName: string | null; licensePlate: string | null } | null {
  if (!input.displayName && !input.licensePlate) {
    return null;
  }
  const plate = input.licensePlate?.trim() ?? null;
  return {
    displayName: input.displayName
      ? sanitizeAuditScalar(input.displayName, 80)
      : null,
    licensePlate: plate
      ? sanitizeAuditScalar(
          plate.length > 4 ? `${plate.slice(0, 2)}***${plate.slice(-2)}` : '***',
          16,
        )
      : null,
  };
}

export function assertNoForbiddenContentInAuditPayload(serialized: string): void {
  const lower = serialized.toLowerCase();
  for (const token of FORBIDDEN_AUDIT_SUBSTRINGS) {
    if (lower.includes(token)) {
      throw new Error(`Audit payload may contain forbidden content: ${token}`);
    }
  }
  if (COORDINATE_PAIR_PATTERN.test(serialized)) {
    throw new Error('Audit payload may contain coordinate pairs');
  }
}

export function buildPseudonymizedUserRef(
  userId: string,
  organizationId: string,
  pepper: string,
): string {
  const digest = createHmac('sha256', pepper || 'synqdrive-ai-audit')
    .update(`${organizationId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
  return `pseudo:${digest}`;
}
