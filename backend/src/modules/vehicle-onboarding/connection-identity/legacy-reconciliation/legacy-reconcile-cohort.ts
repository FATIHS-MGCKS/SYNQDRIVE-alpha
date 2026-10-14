import { createHash } from 'node:crypto';
import type { VehicleConnectionIdentityReconciliationAudit } from '@prisma/client';
import type { LegacyReconcileApprovalManifestEntry } from './legacy-reconcile-approval-manifest';
import { canonicalizeJsonValue } from './stable-metadata-fingerprint';
import type { LegacyReconcilePlanRow } from './legacy-connection-identity-reconcile.types';
import { LEGACY_RECONCILE_ELIGIBILITY } from './legacy-connection-identity-reconcile.types';

export function assertUniqueNonemptyLinkIds(linkIds: string[]): string[] {
  const normalized = linkIds.map((id) => id.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('LEGACY_RECONCILE_LINK_IDS_REQUIRED');
  }
  const seen = new Set<string>();
  for (const id of normalized) {
    if (seen.has(id)) {
      throw new Error(`LEGACY_RECONCILE_DUPLICATE_LINK_ID:${id}`);
    }
    seen.add(id);
  }
  return normalized;
}

export function assertExactCohortPlanCoverage(
  linkIds: string[],
  plan: LegacyReconcilePlanRow[],
  organizationId: string,
): void {
  const planById = new Map(plan.map((row) => [row.sourceLinkId, row]));
  for (const linkId of linkIds) {
    const row = planById.get(linkId);
    if (!row) {
      throw new Error(`LEGACY_RECONCILE_COHORT_LINK_MISSING:${linkId}`);
    }
    if (row.organizationId !== organizationId) {
      throw new Error(`LEGACY_RECONCILE_COHORT_TENANT_MISMATCH:${linkId}`);
    }
  }
  if (linkIds.length !== plan.length) {
    throw new Error('LEGACY_RECONCILE_COHORT_EXTRA_PLAN_ROWS');
  }
}

export function extractApprovalManifestEntryFromAudit(
  audit: VehicleConnectionIdentityReconciliationAudit,
): LegacyReconcileApprovalManifestEntry {
  const provenance = audit.evidenceProvenance as {
    approvalManifestEntry?: LegacyReconcileApprovalManifestEntry;
  };
  const entry = provenance?.approvalManifestEntry;
  if (!entry?.sourceLinkId) {
    throw new Error('LEGACY_RECONCILE_AUDIT_MANIFEST_ENTRY_MISSING');
  }
  return entry;
}

export function computeCohortApprovalManifestFingerprint(
  linkIds: string[],
  plan: LegacyReconcilePlanRow[],
  appliedAudits: Map<string, VehicleConnectionIdentityReconciliationAudit>,
): string {
  const planById = new Map(plan.map((row) => [row.sourceLinkId, row]));
  const entries: LegacyReconcileApprovalManifestEntry[] = [];
  for (const linkId of [...linkIds].sort((a, b) => a.localeCompare(b))) {
    const applied = appliedAudits.get(linkId);
    if (applied?.outcome === 'APPLIED') {
      entries.push(extractApprovalManifestEntryFromAudit(applied));
      continue;
    }
    const row = planById.get(linkId);
    if (!row || row.eligibility !== LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE || !row.approvalManifestEntry) {
      throw new Error(`LEGACY_RECONCILE_COHORT_INELIGIBLE:${linkId}`);
    }
    entries.push(row.approvalManifestEntry);
  }
  const canonical = canonicalizeJsonValue(entries);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
