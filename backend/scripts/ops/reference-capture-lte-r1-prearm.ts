/**
 * Phase 3A.3.1 — PRE-ARM only for DIMO LTE_R1 reference drives.
 * Expensive bootstrap + preflight; leaves session READY without recording.
 */
import { NestFactory } from '@nestjs/core';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import {
  parseAcquisitionState,
  ReferenceCaptureSessionRepository,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { ReferenceCaptureObservationRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-observation.repository';
import {
  assertReferenceCaptureEnabled,
  findBlockingReferenceSession,
  loadOpsEnv,
  parseOpsArg,
  resolveLteR1Vehicle,
} from './reference-capture-ops-shared';

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-prearm')) {
    throw new Error('Refusing to run without --confirm-prearm');
  }

  loadOpsEnv();
  assertReferenceCaptureEnabled();

  const organizationId = parseOpsArg('--organization-id');
  const vehicleIdArg = parseOpsArg('--vehicle-id');
  const licensePlate = parseOpsArg('--license-plate');
  const referenceDriveId = parseOpsArg('--reference-drive-id') ?? 'DIMO_LTE_R1_REFERENCE_DRIVE';

  if (!organizationId) throw new Error('--organization-id is required');
  if (!vehicleIdArg && !licensePlate) {
    throw new Error('--vehicle-id or --license-plate is required');
  }

  const prearmCompletedAtStart = new Date();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const sessionService = app.get(ReferenceCaptureSessionService);
  const sessionRepo = app.get(ReferenceCaptureSessionRepository);
  const observationRepo = app.get(ReferenceCaptureObservationRepository);

  try {
    const vehicle = await resolveLteR1Vehicle(prisma, organizationId, {
      vehicleId: vehicleIdArg,
      licensePlate,
    });

    const blocking = await findBlockingReferenceSession(prisma, organizationId, vehicle.id);
    if (blocking) {
      throw new Error(
        `Active reference session ${blocking.id} (${blocking.status}) already exists for vehicle — resolve before PRE-ARM`,
      );
    }

    const created = await sessionService.createSession({
      organizationId,
      vehicleId: vehicle.id,
      groundTruthVideoRef: null,
    });

    const preflightView = await sessionService.runPreflight(organizationId, created.id);
    const prearmCompletedAt = new Date();

    const finalSession = await sessionRepo.findById(organizationId, created.id);
    const observations = await observationRepo.findBySession(organizationId, created.id, { limit: 10 });
    const signalObservations = observations.filter((o) => o.observationKind === 'SIGNAL_POINT').length;
    const cycleCount = finalSession
      ? parseAcquisitionState(finalSession.acquisitionStateJson).cycleCount
      : 0;

    const prearmReady =
      preflightView.status === ReferenceCaptureSessionStatus.READY &&
      preflightView.readiness?.deploymentPreflightReady === true &&
      !finalSession?.runnerJobId &&
      !finalSession?.pendingCycleJobId &&
      cycleCount === 0 &&
      signalObservations === 0 &&
      !finalSession?.startedAt;

    const report = {
      PREARM_READY: prearmReady ? 'YES' : 'NO',
      referenceDriveId,
      sessionId: created.id,
      vehicleId: vehicle.id,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
      connectionProfile: preflightView.preflight?.connectionProfile ?? null,
      powertrainProfile: preflightView.preflight?.powertrainProfile ?? null,
      manifestVersion: preflightView.preflight?.manifestVersion ?? null,
      availableSignalsCount: preflightView.preflight?.availableSignals?.length ?? 0,
      broadObservationFieldCount: preflightView.preflight?.broadObservationFieldCount ?? 0,
      preflightCompletedAt: prearmCompletedAt.toISOString(),
      prearmDurationMs: prearmCompletedAt.getTime() - prearmCompletedAtStart.getTime(),
      readinessWarnings: preflightView.readiness?.warnings ?? [],
      readinessBlockers: preflightView.readiness?.blockers ?? [],
      sessionStatus: preflightView.status,
      deploymentPreflightReady: preflightView.readiness?.deploymentPreflightReady ?? false,
      runnerJobId: finalSession?.runnerJobId ?? null,
      pendingCycleJobId: finalSession?.pendingCycleJobId ?? null,
      signalObservationCount: signalObservations,
      authority: 'ReferenceCaptureSessionService.createSession + runPreflight (production domain path)',
    };

    console.log(JSON.stringify(report, null, 2));
    if (!prearmReady) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        PREARM_READY: 'NO',
        reason: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
