#!/usr/bin/env ts-node
/**
 * VO-SIG-01 B1 — read-only legacy connection identity reconciliation planner.
 * Does NOT mutate production data (default).
 */
import { PrismaClient } from '@prisma/client';
import {
  computeManifestFingerprint,
  planLegacyConnectionIdentityReconciliation,
} from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.service';

async function main() {
  const prisma = new PrismaClient();
  const organizationId = process.env.VO_SIG_B1_ORGANIZATION_ID;
  const linkIds = process.env.VO_SIG_B1_LINK_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  const allowlist = process.env.VO_SIG_B1_ALLOWLIST_LINK_IDS?.split(',').map((s) => s.trim()).filter(Boolean);

  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId,
    linkIds,
    allowlistLinkIds: allowlist?.length ? new Set(allowlist) : undefined,
  });

  const manifestFingerprint = computeManifestFingerprint(plan);
  console.log(
    JSON.stringify(
      {
        mode: 'DRY_RUN',
        organizationId: organizationId ?? null,
        manifestFingerprint,
        rowCount: plan.length,
        rows: plan,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
