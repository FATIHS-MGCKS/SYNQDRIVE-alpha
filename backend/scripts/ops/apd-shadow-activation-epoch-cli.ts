/**
 * Internal-only APDS shadow activation epoch operator CLI (no HTTP surface).
 *
 * Usage:
 *   APD_SHADOW_EPOCH_OPS_TOKEN=... SYNQDRIVE_DEPLOYED_GIT_SHA=... \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/apd-shadow-activation-epoch-cli.ts \
 *     --command status --actor ops@synqdrive --request-id "$(uuidgen)" --reason "inspect cohort"
 */
import { PrismaClient } from '@prisma/client';
import { ApdShadowActivationEpochOperatorFacade } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/apd-shadow-activation-epoch-operator.facade';
import type { ApdShadowEpochOpsContext } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/apd-shadow-activation-operator.authority';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const cmd = arg('command');
  if (!cmd) {
    console.error('Missing --command (status|preflight|prepare|activate|pause|close)');
    process.exit(1);
  }

  const ops: ApdShadowEpochOpsContext = {
    operatorActor: arg('actor') ?? '',
    operationRequestId: arg('request-id') ?? '',
    operationReason: arg('reason') ?? '',
    opsToken: arg('ops-token') ?? process.env.APD_SHADOW_EPOCH_OPS_TOKEN ?? '',
    expectedDeployedSha: arg('expected-sha') ?? process.env.SYNQDRIVE_DEPLOYED_GIT_SHA,
  };

  const prisma = new PrismaClient();
  const facade = new ApdShadowActivationEpochOperatorFacade(prisma);
  try {
    const result = await facade.run({
      command: cmd as never,
      ops,
      dryRun: hasFlag('dry-run'),
      organizationId: arg('organization-id'),
      epochId: arg('epoch-id'),
      activationRequestKey: arg('activation-request-key'),
      cohortOrganizationIds: arg('cohort-org-ids')?.split(',').map((s) => s.trim()),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
