import type { FleetChatEvidenceSummary } from '../fleet-chat-orchestrator.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response.enums';
import type { FleetChatEvidenceComposeInput } from './fleet-chat-evidence-response.types';
import type { AiExplainOverdueReturnData } from '../../tools/explain-overdue-return/ai-explain-overdue-return.types';
import {
  getHealthData,
  getLocationData,
  getOverdueData,
} from './fleet-chat-evidence-context.util';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const SECRET_PATTERN =
  /\b(?:Bearer\s+\S+|api[_-]?key|password\s*[:=]|secret\s*[:=]|stacktrace|Exception in thread)\b/i;
const STACKTRACE_PATTERN = /\bat\s+[\w.$]+\([\w$.]+\)/i;

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
  delete record.vin;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      record[key] = value
        .replace(/\bsystem\s*prompt\b/gi, '[redacted]')
        .replace(/\bignore\s+all\s+rules\b/gi, '[redacted]')
        .slice(0, 400);
    }
  }
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

function resolveIsMarkedOverdue(
  overdue: AiExplainOverdueReturnData | null,
): boolean | undefined {
  if (!overdue) {
    return undefined;
  }
  if (typeof overdue.isMarkedOverdue === 'boolean') {
    return overdue.isMarkedOverdue;
  }
  const legacy = (overdue as { returnOverdue?: boolean }).returnOverdue;
  return typeof legacy === 'boolean' ? legacy : undefined;
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

  if (VIN_PATTERN.test(text)) {
    issues.push('vin_leak');
  }

  if (SECRET_PATTERN.test(text) || STACKTRACE_PATTERN.test(text)) {
    issues.push('sensitive_content_leak');
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
    if (
      (!location || location.availability === 'unavailable') &&
      /\b\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}\b/.test(text)
    ) {
      issues.push('location_invented_when_unavailable');
    }
  }

  if (responseType === 'HEALTH_SUMMARY') {
    const health = getHealthData(input.toolRecords);
    if (health?.limitedData && /\b(alles in ordnung|all clear|no issues)\b/i.test(text)) {
      issues.push('limited_data_read_as_ok');
    }
    if (!health && /\b(unremarkable|unauffällig|gesund|healthy|all clear|alles in ordnung)\b/i.test(text)) {
      issues.push('health_invented_when_missing');
    }
    if (
      health &&
      health.overallStatus === 'critical' &&
      /\b(unremarkable|unauffällig|gesund|healthy|all clear)\b/i.test(text)
    ) {
      issues.push('critical_health_read_as_ok');
    }
    const dtcMatches = [...text.matchAll(/\bP[0-9A-F]{4}\b/gi)].map((m) => m[0].toUpperCase());
    const grounded = [
      ...(health?.readyToRentBlockers ?? []),
      health?.overallStatus ?? '',
    ]
      .join(' ')
      .toUpperCase();
    for (const dtc of dtcMatches) {
      if (!grounded.includes(dtc)) {
        issues.push(`dtc_not_grounded:${dtc}`);
      }
    }
  }

  if (responseType === 'OVERDUE_EXPLANATION') {
    const overdue = getOverdueData(input.toolRecords);
    const markedOverdue = resolveIsMarkedOverdue(overdue);
    if (overdue?.explanation && !text.includes(overdue.explanation.slice(0, 24))) {
      issues.push('overdue_explanation_not_grounded');
    }
    if (markedOverdue === false && /(überfällig|überfällig|overdue)/i.test(text)) {
      issues.push('booking_status_invented_overdue');
    }
    if (
      overdue?.extensionStatus !== 'APPLIED_VIA_END_DATE_PATCH' &&
      /(verlängerung|extension).*(genehmigt|approved|active)|genehmigte\s+verlängerung/i.test(
        text,
      )
    ) {
      issues.push('extension_claimed_without_grounding');
    }
  }

  return { valid: issues.length === 0, issues };
}
