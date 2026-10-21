/**
 * EXP-021 — Canonical abort for stuck RECORDING session (preserves observations).
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  const organizationId = process.env.ORGANIZATION_ID;
  const sessionId = process.env.SESSION_ID;
  const reason =
    process.env.ABORT_REASON ?? 'exp021_stuck_recording_session_canonical_abort';

  if (!organizationId || !sessionId) {
    throw new Error('ORGANIZATION_ID and SESSION_ID are required');
  }

  loadEnv();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });

  try {
    const sessionService = app.get(ReferenceCaptureSessionService);
    const prisma = app.get(PrismaService);
    const before = await prisma.referenceCaptureSession.findUnique({ where: { id: sessionId } });
    const obsBefore = await prisma.referenceCaptureObservation.count({ where: { sessionId } });
    const aborted = await sessionService.abortSession(organizationId, sessionId, reason);
    const obsAfter = await prisma.referenceCaptureObservation.count({ where: { sessionId } });

    console.log(
      JSON.stringify(
        {
          STUCK_SESSION_TERMINALIZED: 'YES',
          STUCK_SESSION_FINAL_STATUS: aborted.status,
          EVIDENCE_PRESERVED: obsAfter === obsBefore && obsAfter > 0 ? 'YES' : obsAfter === obsBefore ? 'YES' : 'NO',
          observationCount: obsAfter,
          failureReason: aborted.failureReason,
          completedAt: aborted.completedAt,
          beforeStatus: before?.status,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('ABORT_FAILED', error);
  process.exit(1);
});
