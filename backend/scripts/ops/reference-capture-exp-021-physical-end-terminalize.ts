/**
 * EXP-021 — Canonical terminalization when physical drive ended before plan completion.
 * Preserves observations, native temporal ledgers, and settlement shadow evidence.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { parseAcquisitionState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';

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
  const physicalEndAtRaw =
    process.env.PHYSICAL_END_AT ?? '2026-09-11T05:03:38.000Z';

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
    const beforeState = parseAcquisitionState(before?.acquisitionStateJson);
    const beforeExperiment = await prisma.referenceCaptureSettlementShadowExperiment.findFirst({
      where: { sessionId },
    });
    const obsBefore = await prisma.referenceCaptureObservation.count({ where: { sessionId } });

    const physicalEndAt = new Date(physicalEndAtRaw);
    const terminalized = await sessionService.terminalizeExp021PhysicalEndEarly(
      organizationId,
      sessionId,
      physicalEndAt,
    );

    const after = await prisma.referenceCaptureSession.findUnique({ where: { id: sessionId } });
    const afterState = parseAcquisitionState(after?.acquisitionStateJson);
    const afterExperiment = await prisma.referenceCaptureSettlementShadowExperiment.findFirst({
      where: { sessionId },
    });
    const obsAfter = await prisma.referenceCaptureObservation.count({ where: { sessionId } });

    console.log(
      JSON.stringify(
        {
          PHYSICAL_END_TERMINALIZED: 'YES',
          PHYSICAL_END_AT: physicalEndAt.toISOString(),
          EVIDENCE_PRESERVED: obsAfter === obsBefore ? 'YES' : 'NO',
          observationCount: obsAfter,
          before: {
            sessionStatus: before?.status,
            calibrationTerminal: beforeState.hfCalibrationSeries?.terminalFinalizationAt ?? null,
            activePhasePollMs: beforeState.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs ?? null,
            settlementStatus: beforeExperiment?.status ?? null,
          },
          after: {
            sessionStatus: after?.status,
            calibrationTerminal: afterState.hfCalibrationSeries?.terminalFinalizationAt ?? null,
            activePhasePollMs: afterState.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs ?? null,
            skippedPhasePlans: afterState.hfCalibrationSeries?.skippedPhasePlans ?? [],
            settlementStatus: afterExperiment?.status ?? null,
          },
          terminalSessionStatus: terminalized.status,
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
  console.error('PHYSICAL_END_TERMINALIZE_FAILED', error);
  process.exit(1);
});
