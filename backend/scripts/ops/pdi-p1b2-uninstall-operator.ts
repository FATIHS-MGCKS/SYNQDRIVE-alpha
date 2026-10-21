/**
 * PDI P1B.2 — pilot-safe uninstall operator (INSTALLED → PENDING_RETURN only).
 *
 * Default: read-only dry run. Execute requires process-local gates only (never backend.env).
 *
 *   cd backend
 *   PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b2-uninstall-operator.ts \
 *     --physical-device-id=<uuid> --vehicle-id=<uuid> --assignment-id=<uuid> \
 *     --idempotency-key=<key> --uninstall-reason="..." \
 *     --actor-email=admin@synqdrive.de \
 *     --operator-attestation="Owner authorized physical removal ..."
 *
 * Execute:
 *   PDI_P1B2_UNINSTALL_OPERATOR_ENABLED=true \
 *   PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true \
 *   PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b2-uninstall-operator.ts \
 *     --execute --confirm-p1b2-uninstall ... (same scope flags)
 */
import * as fs from 'fs';
import * as path from 'path';
import { parsePdiP1b2UninstallOperatorScope } from '../../src/modules/physical-device-inventory/pdi-p1b2-uninstall-operator.lib';
import {
  createPdiP1b2UninstallOperatorApplicationContext,
  runPdiP1b2UninstallOperator,
} from '../../src/modules/physical-device-inventory/pdi-p1b2-uninstall-operator.runner';

function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main(): Promise<void> {
  loadEnvFile();
  const execute = process.argv.includes('--execute');
  const confirm = process.argv.includes('--confirm-p1b2-uninstall');
  const scope = parsePdiP1b2UninstallOperatorScope({
    physicalDeviceId: parseArg('--physical-device-id'),
    vehicleId: parseArg('--vehicle-id'),
    assignmentId: parseArg('--assignment-id'),
    idempotencyKey: parseArg('--idempotency-key'),
    uninstallReason: parseArg('--uninstall-reason'),
  });

  const app = await createPdiP1b2UninstallOperatorApplicationContext();
  try {
    const outcome = await runPdiP1b2UninstallOperator(app, {
      execute,
      confirmFlag: confirm,
      actorUserId: parseArg('--actor-user-id'),
      actorEmail: parseArg('--actor-email'),
      operatorAttestation: parseArg('--operator-attestation'),
      scope,
    });

    if (!outcome.ok) {
      if (outcome.stdout) console.log(outcome.stdout);
      console.error(outcome.stderr);
      process.exitCode = outcome.exitCode;
      return;
    }

    console.log(outcome.stdout);
    if (outcome.exitCode !== 0) {
      process.exitCode = outcome.exitCode;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
