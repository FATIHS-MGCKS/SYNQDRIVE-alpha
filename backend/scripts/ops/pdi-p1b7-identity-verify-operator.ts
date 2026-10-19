/**
 * PDI P1B.7 Gate C — single authorized identity verification via PhysicalDeviceInventoryService.
 *
 * Server-trusted operator path (SSH synqdrive-admin). Does not expose HTTP or bypass JWT guards.
 * Master Admin attribution uses a real MASTER_ADMIN user resolved from the database — never fabricated.
 *
 * Default: read-only dry run (preflight + payload preview).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-identity-verify-operator.ts \
 *     --actor-email=admin@synqdrive.de \
 *     --operator-attestation="Owner authorized PDI P1B.7 Gate C identity verify DIMO 192922"
 *
 * Execute (production — requires env gate + explicit flags):
 *   PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-identity-verify-operator.ts \
 *     --execute --confirm-p1b7-identity-verify \
 *     --actor-email=admin@synqdrive.de \
 *     --operator-attestation="Owner authorized PDI P1B.7 Gate C identity verify DIMO 192922"
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  createPdiP1b7IdentityVerifyOperatorApplicationContext,
  runPdiP1b7IdentityVerifyOperator,
} from '../../src/modules/physical-device-inventory/pdi-p1b7-identity-verify-operator.runner';

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
  const confirm = process.argv.includes('--confirm-p1b7-identity-verify');
  const actorUserId = parseArg('--actor-user-id');
  const actorEmail = parseArg('--actor-email');
  const operatorAttestation = parseArg('--operator-attestation');

  const app = await createPdiP1b7IdentityVerifyOperatorApplicationContext();

  try {
    const outcome = await runPdiP1b7IdentityVerifyOperator(app, {
      execute,
      confirmFlag: confirm,
      actorUserId,
      actorEmail,
      operatorAttestation,
    });

    if (!outcome.ok) {
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
