import type { AiEvidence, AiEvidenceValue } from './ai-evidence.types';

const REDACTED_PLACEHOLDER = '[REDACTED]';

function redactValue(value: AiEvidenceValue): AiEvidenceValue {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return REDACTED_PLACEHOLDER;
  }
  if (Array.isArray(value)) {
    return value.map(() => REDACTED_PLACEHOLDER);
  }
  const redacted: { [key: string]: AiEvidenceValue } = {};
  for (const key of Object.keys(value)) {
    redacted[key] = REDACTED_PLACEHOLDER;
  }
  return redacted;
}

/**
 * Produces an LLM-safe copy: redacts PII/restricted values and appends warnings.
 * Does not mutate the input record.
 */
export function serializeAiEvidenceForLlm(evidence: AiEvidence): AiEvidence {
  const needsRedaction =
    evidence.sensitivity === 'pii' || evidence.sensitivity === 'restricted';

  if (!needsRedaction) {
    return evidence;
  }

  const warnings = [...evidence.warnings];
  if (!warnings.includes('value_redacted_for_llm')) {
    warnings.push('value_redacted_for_llm');
  }

  return {
    ...evidence,
    value: redactValue(evidence.value),
    reasonCode:
      evidence.reasonCode === 'ok' ? 'sensitivity_redacted' : evidence.reasonCode,
    warnings,
  };
}

/** JSON round-trip for audit logs and SSE payloads. */
export function toAiEvidenceJson(evidence: AiEvidence): string {
  return JSON.stringify(evidence);
}

/** Parse and validate JSON boundary input (throws on invalid JSON). */
export function parseAiEvidenceJson(raw: string): AiEvidence {
  const parsed: unknown = JSON.parse(raw);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI evidence JSON must be an object');
  }
  return parsed as AiEvidence;
}
