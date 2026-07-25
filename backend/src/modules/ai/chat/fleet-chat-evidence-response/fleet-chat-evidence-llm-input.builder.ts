import type { FleetChatEvidenceSummary } from '../fleet-chat-orchestrator.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response.enums';
import type { FleetChatEvidenceComposeInput } from './fleet-chat-evidence-response.types';
import {
  getHealthData,
  getLocationData,
  getOverdueData,
} from './fleet-chat-evidence-context.util';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function buildEvidenceLlmUserContext(
  input: FleetChatEvidenceComposeInput,
  responseType: FleetChatResponseType,
): string {
  const facts: Record<string, unknown> = {
    userMessage: input.userMessage.slice(0, 500),
    language: input.language,
    primaryIntent: input.route.primaryIntent,
    responseType,
    partial: input.partial,
    vehicle: input.route.vehicleReferences[0] ?? null,
    tools: input.toolRecords.map((record) => ({
      toolName: record.toolName,
      success: record.success,
      partial: record.outcome.partial,
      errors: record.outcome.errors.map((error) => error.code),
      data: sanitizeToolDataForLlm(record.outcome.data),
    })),
    evidenceCount: input.mergedEvidence.length,
  };

  return [
    'Compose a grounded fleet answer using ONLY these structured facts.',
    'Return plain language — no invented values beyond this payload.',
    JSON.stringify(facts, null, 0).slice(0, 5_500),
  ].join('\n');
}

function sanitizeToolDataForLlm(data: unknown): unknown {
  if (data == null) {
    return null;
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  const record = { ...(data as Record<string, unknown>) };
  delete record.vehicleId;
  delete record.bookingId;
  delete record.customerId;
  delete record.organizationId;
  return record;
}

export function buildEvidenceSummaryItems(
  records: readonly FleetChatToolExecutionRecord[],
): FleetChatEvidenceSummary[] {
  return records.map((record) => ({
    source: record.toolName,
    factKind: 'observed',
    freshness: String(
      (record.outcome.data as Record<string, unknown> | null)?.freshness ?? 'not_applicable',
    ),
    availability: String(
      (record.outcome.data as Record<string, unknown> | null)?.availability ?? 'partial',
    ),
    confidence: 'medium',
    summary: summarizeForSummary(record),
  }));
}

function summarizeForSummary(record: FleetChatToolExecutionRecord): string {
  const data = record.outcome.data as Record<string, unknown> | null;
  if (!data) {
    return 'no data';
  }
  const keys = ['freshness', 'overallStatus', 'returnOverdue', 'reasonCodes', 'explanation', 'limitedData'];
  const parts: string[] = [];
  for (const key of keys) {
    if (key in data) {
      parts.push(`${key}=${JSON.stringify(data[key])}`);
    }
  }
  return parts.join('; ') || record.toolName;
}

export interface LlmOutputValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export function validateLlmVisibleText(
  input: FleetChatEvidenceComposeInput,
  visibleText: string,
  responseType: FleetChatResponseType,
): LlmOutputValidationResult {
  const issues: string[] = [];
  const text = visibleText.trim();
  if (text.length === 0) {
    issues.push('empty_output');
  }

  const uuidMatches = text.match(UUID_PATTERN) ?? [];
  for (const uuid of uuidMatches) {
    issues.push(`internal_id_leak:${uuid}`);
  }

  if (responseType === 'LOCATION_SUMMARY') {
    const location = getLocationData(input.toolRecords);
    if (location?.latitude != null && location.longitude != null) {
      const lat = location.latitude.toFixed(2);
      const lng = location.longitude.toFixed(2);
      if (!text.includes(lat.slice(0, 4)) && !text.includes(lng.slice(0, 4))) {
        issues.push('location_coords_not_grounded');
      }
    }
    if (location?.isLastKnownLocation && /\b(live|aktuell|current)\b/i.test(text)) {
      issues.push('last_known_labeled_live');
    }
  }

  if (responseType === 'HEALTH_SUMMARY') {
    const health = getHealthData(input.toolRecords);
    if (health?.limitedData && /\b(alles in ordnung|all clear|no issues)\b/i.test(text)) {
      issues.push('limited_data_read_as_ok');
    }
  }

  if (responseType === 'OVERDUE_EXPLANATION') {
    const overdue = getOverdueData(input.toolRecords);
    if (overdue?.explanation && !text.includes(overdue.explanation.slice(0, 24))) {
      issues.push('overdue_explanation_not_grounded');
    }
  }

  return { valid: issues.length === 0, issues };
}
