import { createHash } from 'crypto';
import type { DocumentActionPlanInputIdentity } from './document-action-plan.types';
import { DOCUMENT_ACTION_PLAN_FINGERPRINT_SCHEMA_VERSION } from './document-action-plan.types';

const SECRET_KEY_PATTERN =
  /(secret|password|token|apikey|api_key|authorization|bearer|private_key|credential)/i;

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

export function assertPlanIdentityHasNoSecrets(identity: DocumentActionPlanInputIdentity): void {
  for (const key of Object.keys(identity.confirmedData ?? {})) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Plan fingerprint confirmedData must not include secret-like key: ${key}`);
    }
  }
  for (const link of identity.entityLinks ?? []) {
    for (const key of Object.keys(link)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Plan fingerprint entityLinks must not include secret-like key: ${key}`);
      }
    }
  }
}

function normalizeEntityLinks(
  entityLinks: DocumentActionPlanInputIdentity['entityLinks'],
): Array<{ role: string; entityType: string; entityId: string }> {
  return [...(entityLinks ?? [])]
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

/**
 * Deterministic SHA-256 fingerprint from effective type, confirmed data, and entity links.
 */
export function buildDocumentActionPlanInputFingerprint(
  identity: DocumentActionPlanInputIdentity,
): string {
  assertPlanIdentityHasNoSecrets(identity);

  const payload = {
    schemaVersion: identity.schemaVersion ?? DOCUMENT_ACTION_PLAN_FINGERPRINT_SCHEMA_VERSION,
    organizationId: identity.organizationId,
    extractionId: identity.extractionId,
    effectiveDocumentType: String(identity.effectiveDocumentType).trim(),
    confirmedData: identity.confirmedData ?? {},
    entityLinks: normalizeEntityLinks(identity.entityLinks),
    applyMode: identity.applyMode,
    applySafetyDecision: identity.applySafetyDecision ?? {},
  };

  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function requiresNewDocumentActionPlan(
  existing: { inputFingerprint: string } | null,
  nextFingerprint: string,
): boolean {
  if (!existing) return true;
  return existing.inputFingerprint !== nextFingerprint;
}

export function isDocumentActionPlanCurrent(plan: { invalidatedAt: Date | null }): boolean {
  return plan.invalidatedAt == null;
}
