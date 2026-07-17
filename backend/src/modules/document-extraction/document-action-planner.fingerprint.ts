import { createHash } from 'crypto';
import type { DocumentActionPlannerInput } from './document-action-planner.types';
import { DOCUMENT_ACTION_PLANNER_VERSION } from './document-action-planner.types';

export const DOCUMENT_ACTION_PLANNER_FINGERPRINT_SCHEMA_VERSION = 1;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value != null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function normalizeEntityLinks(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
): Array<{ role: string; entityType: string; entityId: string }> {
  return [...entityLinks]
    .map((link) => ({
      role: String(link.role).trim(),
      entityType: String(link.entityType).trim(),
      entityId: String(link.entityId).trim(),
    }))
    .sort((a, b) => {
      const left = `${a.role}|${a.entityType}|${a.entityId}`;
      const right = `${b.role}|${b.entityType}|${b.entityId}`;
      return left.localeCompare(right);
    });
}

function normalizeCandidates(
  candidates: DocumentActionPlannerInput['entityCandidates'],
): Array<{
  entityType: string;
  entityId: string;
  confidence: number | null;
  status: string;
  matchReasonCodes: string[];
}> {
  return [...candidates]
    .map((candidate) => ({
      entityType: String(candidate.entityType).trim(),
      entityId: String(candidate.entityId ?? '').trim(),
      confidence:
        candidate.confidence == null || Number.isNaN(Number(candidate.confidence))
          ? null
          : Number(candidate.confidence),
      status: String(candidate.status ?? 'PROPOSED').trim(),
      matchReasonCodes: [...(candidate.matchReasonCodes ?? [])].map(String).sort(),
    }))
    .sort((a, b) => {
      const left = `${a.entityType}|${a.entityId}|${a.status}`;
      const right = `${b.entityType}|${b.entityId}|${b.status}`;
      return left.localeCompare(right);
    });
}

function normalizePlausibility(
  plausibility: DocumentActionPlannerInput['plausibility'],
): {
  overallStatus: string;
  checks: Array<{ code: string; status: string; message: string; source: string }>;
  recommendedHumanReviewNotes: string[];
} {
  return {
    overallStatus: plausibility.overallStatus,
    checks: [...plausibility.checks]
      .map((check) => ({
        code: check.code,
        status: check.status,
        message: check.message,
        source: check.source,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    recommendedHumanReviewNotes: [...plausibility.recommendedHumanReviewNotes].sort(),
  };
}

/**
 * Deterministic SHA-256 fingerprint over the full planner input contract.
 * Same normalized input always yields the same fingerprint.
 */
export function buildDocumentActionPlannerInputFingerprint(
  input: DocumentActionPlannerInput,
): string {
  const payload = {
    schemaVersion: DOCUMENT_ACTION_PLANNER_FINGERPRINT_SCHEMA_VERSION,
    plannerVersion: input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION,
    organizationId: input.organizationId,
    extractionId: input.extractionId,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype?.trim() ?? null,
    effectiveDocumentType: input.effectiveDocumentType,
    confirmedData: input.confirmedData ?? {},
    plausibility: normalizePlausibility(input.plausibility),
    entityLinks: normalizeEntityLinks(input.entityLinks),
    entityCandidates: normalizeCandidates(input.entityCandidates),
    featureFlags: input.featureFlags,
    downstreamCapabilities: input.downstreamCapabilities,
    applyMode: input.applyMode,
    applySafetyDecision: input.applySafetyDecision ?? {},
  };

  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
