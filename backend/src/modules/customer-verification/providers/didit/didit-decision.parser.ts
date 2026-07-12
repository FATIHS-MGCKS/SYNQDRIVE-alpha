import { CustomerVerificationCheckKind } from '@prisma/client';
import type {
  DiditDecisionV3,
  DiditIdVerification,
  DiditPoaVerification,
} from './didit-webhook.types';

const REDACTED_DECISION_KEYS = new Set([
  'document_number',
  'mrz',
  'mrz_data',
  'mrz_lines',
]);

export type DiditDecisionParseResult = {
  decisionJson: Record<string, unknown> | null;
  extractedJson: Record<string, unknown> | null;
  warnings: Array<{ source: string; message: string }>;
};

function redactDecisionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactDecisionValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !REDACTED_DECISION_KEYS.has(key))
        .map(([key, nested]) => [key, redactDecisionValue(nested)]),
    );
  }
  return value;
}

function extractIdVerification(
  items: DiditIdVerification[] | undefined,
): Record<string, unknown> | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const latest = items[items.length - 1];
  const extracted: Record<string, unknown> = {};
  const fields: (keyof DiditIdVerification)[] = [
    'first_name',
    'last_name',
    'document_type',
    'date_of_birth',
    'issue_date',
    'expiration_date',
    'issuing_state',
    'nationality',
    'warnings',
  ];
  for (const field of fields) {
    if (latest[field] !== undefined && latest[field] !== null) {
      extracted[field] = latest[field];
    }
  }
  return Object.keys(extracted).length > 0 ? extracted : null;
}

function extractPoaVerification(
  items: DiditPoaVerification[] | undefined,
): Record<string, unknown> | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const latest = items[items.length - 1];
  const extracted: Record<string, unknown> = {};
  const fields: (keyof DiditPoaVerification)[] = [
    'status',
    'document_type',
    'issuer',
    'poa_address',
    'poa_parsed_address',
    'issue_date',
    'expiration_date',
  ];
  for (const field of fields) {
    if (latest[field] !== undefined && latest[field] !== null) {
      extracted[field] = latest[field];
    }
  }
  return Object.keys(extracted).length > 0 ? extracted : null;
}

export function parseDiditDecision(
  decision: DiditDecisionV3 | null | undefined,
  kind: CustomerVerificationCheckKind,
): DiditDecisionParseResult {
  const warnings: Array<{ source: string; message: string }> = [];

  if (!decision || typeof decision !== 'object') {
    return { decisionJson: null, extractedJson: null, warnings };
  }

  if (Array.isArray(decision.liveness_checks) && decision.liveness_checks.length > 0) {
    warnings.push({
      source: 'didit_biometric',
      message:
        'Unexpected biometric Didit modules received; check workflow configuration.',
    });
  }
  if (Array.isArray(decision.face_matches) && decision.face_matches.length > 0) {
    warnings.push({
      source: 'didit_biometric',
      message:
        'Unexpected biometric Didit modules received; check workflow configuration.',
    });
  }

  const decisionJson = redactDecisionValue(decision) as Record<string, unknown>;

  let extractedJson: Record<string, unknown> | null = null;
  if (kind === 'PROOF_OF_ADDRESS') {
    extractedJson = extractPoaVerification(decision.poa_verifications);
  } else {
    extractedJson = extractIdVerification(decision.id_verifications);
  }

  return { decisionJson, extractedJson, warnings };
}

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
