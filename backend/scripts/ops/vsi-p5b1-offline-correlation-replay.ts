/**
 * Operator-invoked P5B.1 offline VSI↔APDS correlation replay (read-only).
 *
 * Example (no credentials):
 *   VSI_P5B1_ORG_ID=<org-uuid> \
 *   VSI_P5B1_DECISION_AT_FROM=2026-10-01T00:00:00.000Z \
 *   VSI_P5B1_DECISION_AT_TO=2026-10-16T00:00:00.000Z \
 *   VSI_P5B1_BATCH_LIMIT=50 \
 *   VSI_P5B1_MAX_TOTAL_DECISIONS=500 \
 *   npx ts-node scripts/ops/vsi-p5b1-offline-correlation-replay.ts
 */
import { PrismaClient } from '@prisma/client';
import { VsiApdsP5b1OfflineReplayService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1DecisionRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5ReadonlyService } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { VsiApdsP5b1OperatorScopeError } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-p5b1-operator-scope';

function parseIso(name: string, raw: string | undefined): Date {
  if (!raw?.trim()) {
    throw new VsiApdsP5b1OperatorScopeError('DECISION_TIME_WINDOW_REQUIRED', `${name} is required`);
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    throw new VsiApdsP5b1OperatorScopeError('DECISION_TIME_WINDOW_INVALID', `${name} is invalid`);
  }
  return d;
}

async function main() {
  const organizationId = process.env.VSI_P5B1_ORG_ID;
  const vehicleId = process.env.VSI_P5B1_VEHICLE_ID;
  const decisionAtFrom = parseIso('VSI_P5B1_DECISION_AT_FROM', process.env.VSI_P5B1_DECISION_AT_FROM);
  const decisionAtTo = parseIso('VSI_P5B1_DECISION_AT_TO', process.env.VSI_P5B1_DECISION_AT_TO);
  const batchLimit = Number(process.env.VSI_P5B1_BATCH_LIMIT ?? '');
  const maxTotalDecisions = Number(process.env.VSI_P5B1_MAX_TOTAL_DECISIONS ?? '');
  const cursorDecisionAt = process.env.VSI_P5B1_CURSOR_DECISION_AT;
  const cursorId = process.env.VSI_P5B1_CURSOR_ID;

  const prisma = new PrismaClient();
  const profiles = new VsiCapabilityResolverRepository(prisma as never);
  const service = new VsiApdsP5b1OfflineReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    profiles,
    new VsiApdsP5ReadonlyService(profiles),
    new VsiApdsP5b1EvidenceWriter(prisma as never),
  );

  const result = await service.runOfflineReplayBatch({
    filter: {
      organizationId,
      vehicleId,
      decisionAtFrom,
      decisionAtTo,
      activationEpochId: process.env.VSI_P5B1_ACTIVATION_EPOCH_ID ?? undefined,
      policyVersions: process.env.VSI_P5B1_POLICY_VERSIONS?.split(',').map((s) => s.trim()),
    },
    pagination: {
      limit: batchLimit,
      cursorDecisionAt: cursorDecisionAt ? new Date(cursorDecisionAt) : undefined,
      cursorId,
    },
    maxTotalDecisions,
    dryRun: true,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  if (err instanceof VsiApdsP5b1OperatorScopeError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
