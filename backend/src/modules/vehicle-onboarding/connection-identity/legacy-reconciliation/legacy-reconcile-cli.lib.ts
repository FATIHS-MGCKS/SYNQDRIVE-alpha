import type { PrismaClient } from '@prisma/client';
import {
  applyLegacyConnectionIdentityReconciliation,
  computeDeterministicApprovalManifestFingerprint,
  planLegacyConnectionIdentityReconciliation,
} from './legacy-connection-identity-reconcile.service';
import type { LegacyReconcileAuthorization } from './legacy-connection-identity-reconcile.types';
import { assertUniqueNonemptyLinkIds } from './legacy-reconcile-cohort';
import {
  VO_SIG_B1_PRODUCTION_COHORT_ORGANIZATION_ID,
  VO_SIG_B1_PRODUCTION_COHORT_SOURCE_LINK_IDS,
} from './vo-sig-b1-production-cohort.registry';

export type LegacyReconcileCliInput = {
  organizationId: string;
  linkIds: string[];
  allowProductionCohortOnly: boolean;
};

export function resolveLegacyReconcileCliInput(env: NodeJS.ProcessEnv = process.env): LegacyReconcileCliInput {
  const organizationId = env.VO_SIG_B1_ORGANIZATION_ID?.trim() || VO_SIG_B1_PRODUCTION_COHORT_ORGANIZATION_ID;
  const linkIdsRaw = env.VO_SIG_B1_LINK_IDS?.trim();
  const linkIds = linkIdsRaw
    ? assertUniqueNonemptyLinkIds(linkIdsRaw.split(','))
    : [...VO_SIG_B1_PRODUCTION_COHORT_SOURCE_LINK_IDS];
  const allowProductionCohortOnly = env.VO_SIG_B1_ALLOW_NON_PRODUCTION_COHORT !== '1';
  if (allowProductionCohortOnly) {
    const expected = [...VO_SIG_B1_PRODUCTION_COHORT_SOURCE_LINK_IDS].sort().join(',');
    const actual = [...linkIds].sort().join(',');
    if (expected !== actual) {
      throw new Error('LEGACY_RECONCILE_CLI_COHORT_GUARD_VIOLATION');
    }
    if (organizationId !== VO_SIG_B1_PRODUCTION_COHORT_ORGANIZATION_ID) {
      throw new Error('LEGACY_RECONCILE_CLI_ORG_GUARD_VIOLATION');
    }
  }
  return { organizationId, linkIds, allowProductionCohortOnly };
}

export async function runLegacyReconcileDryRun(prisma: PrismaClient, input: LegacyReconcileCliInput) {
  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: input.organizationId,
    linkIds: input.linkIds,
    allowlistLinkIds: new Set(input.linkIds),
  });
  const manifestFingerprint = computeDeterministicApprovalManifestFingerprint(plan);
  return { mode: 'DRY_RUN' as const, manifestFingerprint, rowCount: plan.length, rows: plan };
}

export async function runLegacyReconcileExecute(
  prisma: PrismaClient,
  input: LegacyReconcileCliInput,
  auth: LegacyReconcileAuthorization,
) {
  const results = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
    organizationId: input.organizationId,
    linkIds: input.linkIds,
  });
  return { mode: 'EXECUTE' as const, results };
}
