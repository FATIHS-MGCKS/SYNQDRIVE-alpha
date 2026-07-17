import { createHash } from 'crypto';
import type { DocumentActionPlanStatus, DocumentPlannedAction } from './document-action.types';

export const DOCUMENT_ACTION_PLAN_VERSION = 1;

export const DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS = {
  INPUT_FINGERPRINT_CHANGED: 'INPUT_FINGERPRINT_CHANGED',
  CONFIRMED_DATA_CHANGED: 'CONFIRMED_DATA_CHANGED',
  MANUAL_INVALIDATION: 'MANUAL_INVALIDATION',
} as const;

export type DocumentActionPlanInvalidationReason =
  (typeof DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS)[keyof typeof DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS];

export type DocumentActionPlan = {
  planId: string;
  planVersion: number;
  fingerprint: string;
  status: DocumentActionPlanStatus;
  extractionId: string;
  organizationId: string | null;
  vehicleId: string;
  documentType: string;
  planOutcome: string;
  actions: DocumentPlannedAction[];
  confirmedAt: string;
  confirmedById?: string | null;
  invalidationReason?: DocumentActionPlanInvalidationReason | null;
  metadata?: Record<string, unknown>;
};

export type BuildDocumentActionPlanInput = {
  extractionId: string;
  organizationId: string | null;
  vehicleId: string;
  documentType: string;
  confirmedData: Record<string, unknown>;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
  confirmedById?: string | null;
  planContext?: Record<string, unknown>;
};

export function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function computeActionPlanFingerprint(input: {
  planVersion: number;
  extractionId: string;
  documentType: string;
  planOutcome: string;
  actions: Array<{ semanticAction: string; requirement: string; sequence: number }>;
  confirmedData: Record<string, unknown>;
}): string {
  const payload = stableStringify({
    planVersion: input.planVersion,
    extractionId: input.extractionId,
    documentType: input.documentType,
    planOutcome: input.planOutcome,
    actions: input.actions,
    confirmedData: input.confirmedData,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function buildActionIdempotencyKey(input: {
  extractionId: string;
  planVersion: number;
  fingerprint: string;
  sequence: number;
  semanticAction: string;
}): string {
  return [
    input.extractionId,
    `v${input.planVersion}`,
    input.fingerprint,
    `a${input.sequence}`,
    input.semanticAction,
  ].join(':');
}
