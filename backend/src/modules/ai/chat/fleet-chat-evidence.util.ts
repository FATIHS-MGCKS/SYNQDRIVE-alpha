import type { AiEvidence } from '../evidence/ai-evidence.types';
import { serializeAiEvidenceForLlm } from '../evidence/ai-evidence.serialization';
import type { FleetChatEvidenceSummary } from './fleet-chat-orchestrator.types';

const MAX_SUMMARY_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function summarizePrimitive(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return truncate(value, 120);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}}`;
  }
  return String(value);
}

export function summarizeToolDataForLlm(
  toolName: string,
  data: unknown,
): FleetChatEvidenceSummary[] {
  if (data == null) {
    return [
      {
        source: toolName,
        factKind: 'observed',
        freshness: 'not_applicable',
        availability: 'unavailable',
        confidence: 'unknown',
        summary: 'no data',
      },
    ];
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    return [
      {
        source: toolName,
        factKind: 'observed',
        freshness: 'not_applicable',
        availability: 'available',
        confidence: 'medium',
        summary: summarizePrimitive(data),
      },
    ];
  }

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    'vehicleId',
    'displayName',
    'licensePlate',
    'latitude',
    'longitude',
    'freshness',
    'telemetryState',
    'overallStatus',
    'contextKind',
    'returnOverdue',
    'pickupOverdue',
    'reasonCodes',
    'explanation',
    'openProcessSteps',
    'domains',
    'isLastKnownLocation',
    'isLastKnownTelemetry',
  ];

  const summaries: FleetChatEvidenceSummary[] = [];
  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    summaries.push({
      source: toolName,
      factKind: 'observed',
      freshness: String(record.freshness ?? 'not_applicable'),
      availability: String(record.availability ?? 'available'),
      confidence: 'medium',
      summary: `${key}=${summarizePrimitive(record[key])}`,
    });
    if (summaries.length >= 8) break;
  }

  return summaries.length > 0
    ? summaries
    : [
        {
          source: toolName,
          factKind: 'observed',
          freshness: 'not_applicable',
          availability: 'partial',
          confidence: 'low',
          summary: truncate(JSON.stringify(record), MAX_SUMMARY_CHARS),
        },
      ];
}

export function mergeEvidenceForLlm(
  records: readonly { outcome: { evidence: readonly AiEvidence[] } }[],
): AiEvidence[] {
  const seen = new Set<string>();
  const merged: AiEvidence[] = [];
  for (const record of records) {
    for (const evidence of record.outcome.evidence) {
      const llmSafe = serializeAiEvidenceForLlm(evidence);
      const key = `${llmSafe.source}:${llmSafe.entityId}:${llmSafe.factKind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(llmSafe);
    }
  }
  return merged;
}

export function buildTokenLightLlmContext(input: {
  readonly userMessage: string;
  readonly language: 'de' | 'en' | 'unknown';
  readonly routePrimaryIntent: string;
  readonly vehicleLabel: string | null;
  readonly evidenceSummaries: readonly FleetChatEvidenceSummary[];
  readonly partial: boolean;
}): string {
  const lines: string[] = [
    `User (${input.language}): ${truncate(input.userMessage, 500)}`,
    `Intent: ${input.routePrimaryIntent}`,
  ];
  if (input.vehicleLabel) {
    lines.push(`Vehicle: ${input.vehicleLabel}`);
  }
  if (input.partial) {
    lines.push('Partial: some domain facts unavailable — do not invent missing data.');
  }
  for (const summary of input.evidenceSummaries.slice(0, 12)) {
    lines.push(
      `[${summary.source}] ${summary.summary} (fresh=${summary.freshness}, avail=${summary.availability})`,
    );
  }
  return truncate(lines.join('\n'), 6_000);
}
