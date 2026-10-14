#!/usr/bin/env ts-node
/**
 * VO-SIG-01 B1 — read-only legacy connection identity reconciliation planner.
 * Prefer `ops:vo-sig-b1:legacy-reconcile:cli` (default DRY_RUN).
 */
import { PrismaClient } from '@prisma/client';
import {
  resolveLegacyReconcileCliInput,
  runLegacyReconcileDryRun,
} from '../../src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-cli.lib';

async function main() {
  const prisma = new PrismaClient();
  const input = resolveLegacyReconcileCliInput();
  const payload = await runLegacyReconcileDryRun(prisma, input);
  console.log(JSON.stringify({ organizationId: input.organizationId, ...payload }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
