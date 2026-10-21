/**
 * HV R22 P1E — owner-gated single-session production capture (one call, no retry).
 *
 *   HV_R22_P1E_CAPTURE_OWNER_AUTHORIZED=1 \
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/hv-r22-p1e-single-session-capture.ts \
 *     --organization-id=<uuid> --session-id=<uuid>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { HvChargingCounterEvidenceCaptureService } from '../../src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/hv-charging-counter-evidence.capture.service';

const envPath = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main() {
  if (process.env.HV_R22_P1E_CAPTURE_OWNER_AUTHORIZED !== '1') {
    throw new Error(
      'Refusing capture: set HV_R22_P1E_CAPTURE_OWNER_AUTHORIZED=1 after owner approval',
    );
  }

  const organizationId = parseArg('--organization-id');
  const sessionId = parseArg('--session-id');
  if (!organizationId || !sessionId) {
    throw new Error('--organization-id and --session-id are required');
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const capture = app.get(HvChargingCounterEvidenceCaptureService);

    const session = await prisma.hvChargeSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new Error(`session not found: ${sessionId}`);
    }
    if (session.isOngoing || !session.endAt) {
      throw new Error('session is not closed');
    }

    const result = await capture.captureForSession({
      organizationId,
      vehicleId: session.vehicleId,
      session,
      persistResult: { changed: false, changeKind: 'no_op' },
    });

    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
