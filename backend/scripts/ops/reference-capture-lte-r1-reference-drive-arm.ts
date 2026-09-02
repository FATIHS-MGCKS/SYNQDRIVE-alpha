/**
 * Phase 3A.3 — ARM + START only for DIMO LTE_R1 Reference Drive #001.
 * Does NOT stop the session. Leaves RECORDING for physical drive.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { HardwareType, ReferenceCaptureSessionStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { ReferenceCaptureObservationRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-observation.repository';
import { ReferenceCaptureSessionRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { buildAcquisitionCyclePlan } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-acquisition-planner';
import { isBrakeCaptureEligible } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics';

const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_001';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasSignal(signals: string[], patterns: string[]): boolean {
  const lower = signals.map((s) => s.toLowerCase());
  return patterns.some((p) => lower.some((s) => s.includes(p.toLowerCase()) || s === p.toLowerCase()));
}

function classifyEligibility(availableSignals: string[]) {
  return {
    speedCaptureEligible: hasSignal(availableSignals, ['speed']),
    rpmCaptureEligible: hasSignal(availableSignals, [
      'powertraincombustionenginespeed',
      'enginespeed',
      'rpm',
    ]),
    throttleCaptureEligible: hasSignal(availableSignals, [
      'throttle',
      'accelerator',
      'pedalposition',
      'acceleratorpedal',
    ]),
    engineLoadCaptureEligible: hasSignal(availableSignals, ['engineload', 'engineLoad', 'load']),
    gearCaptureEligible: hasSignal(availableSignals, [
      'currentgear',
      'selectedgear',
      'transmission',
      'gear',
    ]),
    brakeCaptureEligible: isBrakeCaptureEligible(availableSignals),
    yawLateralCaptureEligible: hasSignal(availableSignals, [
      'yaw',
      'angularvelocity',
      'lateral',
    ]),
    wheelSpeedCaptureEligible: hasSignal(availableSignals, ['wheelspeed', 'wheel']),
    nativeEventEligible: true,
  };
}

async function resolveVehicle(
  prisma: PrismaService,
  organizationId: string,
  licensePlate: string,
  vehicleIdArg?: string,
) {
  if (vehicleIdArg) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleIdArg, organizationId, hardwareType: HardwareType.LTE_R1 },
      select: {
        id: true,
        licensePlate: true,
        fuelType: true,
        hardwareType: true,
        dimoVehicle: {
          select: { tokenId: true, connectionStatus: true, lastSignal: true },
        },
        latestState: { select: { lastSeenAt: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) {
      throw new Error(`Vehicle ${vehicleIdArg} not found or missing DIMO token`);
    }
    return vehicle;
  }

  const compact = licensePlate.replace(/\s+/g, '').toUpperCase();
  const candidates = await prisma.vehicle.findMany({
    where: {
      organizationId,
      hardwareType: HardwareType.LTE_R1,
    },
    select: {
      id: true,
      licensePlate: true,
      fuelType: true,
      hardwareType: true,
      dimoVehicle: {
        select: { tokenId: true, connectionStatus: true, lastSignal: true },
      },
      latestState: { select: { lastSeenAt: true } },
    },
  });

  const vehicle = candidates.find((v) => {
    const plate = (v.licensePlate ?? '').replace(/\s+/g, '').toUpperCase();
    return (
      plate.includes(compact) ||
      plate.includes('WOBL7503') ||
      (v.licensePlate ?? '').toUpperCase().includes('WOB') &&
        (v.licensePlate ?? '').includes('7503')
    );
  });

  if (!vehicle?.dimoVehicle?.tokenId) {
    throw new Error(
      `Vehicle ${licensePlate} not found or missing DIMO token (searched ${candidates.length} LTE_R1 vehicles)`,
    );
  }
  return vehicle;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-reference-drive-arm')) {
    throw new Error('Refusing to run without --confirm-reference-drive-arm');
  }

  loadEnv();
  if (process.env.REFERENCE_CAPTURE_ENABLED !== 'true') {
    throw new Error('REFERENCE_CAPTURE_ENABLED must be true');
  }

  const organizationId =
    parseArg('--organization-id') ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const licensePlate = parseArg('--license-plate') ?? 'WOB L 7503';
  const vehicleIdArg = parseArg('--vehicle-id');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const sessionService = app.get(ReferenceCaptureSessionService);
  const sessionRepo = app.get(ReferenceCaptureSessionRepository);
  const observationRepo = app.get(ReferenceCaptureObservationRepository);

  try {
    const vehicle = await resolveVehicle(prisma, organizationId, licensePlate, vehicleIdArg);

    const existingRecording = await prisma.referenceCaptureSession.findFirst({
      where: {
        organizationId,
        vehicleId: vehicle.id,
        status: ReferenceCaptureSessionStatus.RECORDING,
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (existingRecording) {
      throw new Error(
        `Vehicle already has RECORDING session ${existingRecording.id} — abort to avoid duplicate`,
      );
    }

    const sessionCreatedAt = new Date();
    const created = await sessionService.createSession({
      organizationId,
      vehicleId: vehicle.id,
      groundTruthVideoRef: null,
    });

    const preflightView = await sessionService.runPreflight(organizationId, created.id);
    const preflightCompletedAt = new Date();

    if (preflightView.status !== ReferenceCaptureSessionStatus.READY) {
      throw new Error(
        `Preflight did not reach READY: status=${preflightView.status} blockers=${JSON.stringify(preflightView.readiness?.blockers ?? [])}`,
      );
    }
    if (!preflightView.readiness?.deploymentPreflightReady) {
      throw new Error(`deploymentPreflightReady=false`);
    }

    const availableSignals = preflightView.preflight?.availableSignals ?? [];
    const broadFields = preflightView.preflight?.broadObservationFields ?? [];
    const mappedCount = broadFields.filter((f) => f.canonicalKey != null).length;
    const unmappedCount = broadFields.filter((f) => f.canonicalKey == null).length;

    const cyclePlan = buildAcquisitionCyclePlan({
      cycleNumber: 1,
      captureCycleId: 'preflight-plan',
      broadFields,
      cycleIntervalMs: 5000,
      slowCycleEvery: 1,
    });
    const plannedSurfaces = cyclePlan.surfaces.map((s) => s.surface);

    const eligibility = classifyEligibility(availableSignals);

    const started = await sessionService.startRecording(organizationId, created.id);
    const sessionStartedAt = started.startedAt ?? new Date();

    const pollMs = 2000;
    const maxWaitMs = 120_000;
    const startWait = Date.now();
    let cycleCount = 0;
    let sessionStatus = started.status;

    while (Date.now() - startWait < maxWaitMs) {
      const session = await sessionRepo.findById(organizationId, created.id);
      sessionStatus = session?.status ?? sessionStatus;
      const state = (session?.acquisitionStateJson ?? {}) as {
        cycleCount?: number;
        activeCycleJobId?: string | null;
        lastCycleJobId?: string | null;
      };
      cycleCount = state.cycleCount ?? 0;

      if (
        sessionStatus === ReferenceCaptureSessionStatus.RECORDING &&
        cycleCount >= 1
      ) {
        break;
      }
      if (
        sessionStatus === ReferenceCaptureSessionStatus.FAILED ||
        sessionStatus === ReferenceCaptureSessionStatus.ABORTED
      ) {
        throw new Error(`Session entered terminal status ${sessionStatus}: ${session?.failureReason}`);
      }
      await sleep(pollMs);
    }

    const finalSession = await sessionRepo.findById(organizationId, created.id);
    const finalState = (finalSession?.acquisitionStateJson ?? {}) as {
      cycleCount?: number;
      activeCycleJobId?: string | null;
      lastCycleJobId?: string | null;
      lastCaptureCycleId?: string | null;
    };
    cycleCount = finalState.cycleCount ?? cycleCount;
    sessionStatus = finalSession?.status ?? sessionStatus;

    const observations = await observationRepo.findBySession(organizationId, created.id, {
      limit: 5000,
    });

    const signalObs = observations
      .filter((o) => o.observationKind !== 'NATIVE_EVENT' && o.observationKind !== 'SESSION_METADATA')
      .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

    const firstObs = signalObs[0] ?? observations[0];
    const surfaceCounts = observations.reduce<Record<string, number>>((acc, o) => {
      const key = o.acquisitionSurface ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const report = {
      REFERENCE_DRIVE_ARMED: cycleCount >= 1 && sessionStatus === ReferenceCaptureSessionStatus.RECORDING,
      READY_TO_DRIVE:
        cycleCount >= 1 && sessionStatus === ReferenceCaptureSessionStatus.RECORDING,
      REFERENCE_DRIVE_ID,
      sessionId: created.id,
      vehicle: vehicle.licensePlate,
      vehicleId: vehicle.id,
      tokenId: vehicle.dimoVehicle?.tokenId,
      connectionProfile: preflightView.preflight?.connectionProfile ?? 'DIMO_LTE_R1',
      powertrainProfile: preflightView.preflight?.powertrainProfile ?? null,
      thermalStartState: 'WARM',
      preDriveRecentDrivingMinutesApprox: '10-15',
      engineStateAtArm: 'OFF',
      ignitionStateAtArm: 'ON',
      vehicleMotionAtArm: 'STATIONARY',
      physicalStateMaturity: 'CONFIRMED_FROM_VEHICLE_OBSERVATION (project-owner declaration)',
      sessionCreatedAt: sessionCreatedAt.toISOString(),
      preflightCompletedAt: preflightCompletedAt.toISOString(),
      sessionStartedAt: sessionStartedAt.toISOString(),
      firstCaptureCycleId: finalState.lastCaptureCycleId ?? null,
      firstRequestCorrelationId: firstObs?.requestCorrelationId ?? null,
      firstRequestStartedAt: firstObs?.requestStartedAt?.toISOString() ?? null,
      firstSynqReceivedAt: firstObs?.synqReceivedAt?.toISOString() ?? null,
      firstProviderTimestamp: firstObs?.providerTimestamp?.toISOString() ?? null,
      firstSequenceNumber: firstObs?.sequenceNumber ?? null,
      firstPersistedObservationAt: firstObs?.createdAt?.toISOString() ?? null,
      manifestVersion: preflightView.preflight?.manifestVersion ?? null,
      availableSignalsCount: availableSignals.length,
      broadObservationFieldCount: preflightView.preflight?.broadObservationFieldCount ?? null,
      mappedCapabilityCount: mappedCount,
      unmappedCapabilityCount: unmappedCount,
      plannedSurfaces: plannedSurfaces.map((surface) => ({
        surface,
        status: 'PLANNED',
        observedCount: surfaceCounts[surface] ?? 0,
      })),
      preflightWarnings: preflightView.readiness?.warnings ?? [],
      preflightBlockers: preflightView.readiness?.blockers ?? [],
      deploymentPreflightReady: preflightView.readiness?.deploymentPreflightReady ?? false,
      ...eligibility,
      firstAutonomousCycleResult:
        cycleCount >= 1 ? 'COMPLETE' : cycleCount > 0 ? 'PARTIAL' : 'NOT_OBSERVED',
      cycleCount,
      activeCycleJobId: finalState.activeCycleJobId ?? null,
      pendingCycleJobId: finalSession?.pendingCycleJobId ?? null,
      currentObservationCount: observations.length,
      currentSessionStatus: sessionStatus,
      surfaceCounts,
      vehicleConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      vehicleLastSeenAt: vehicle.latestState?.lastSeenAt?.toISOString() ?? null,
      warnings: preflightView.readiness?.warnings ?? [],
      blockers: [],
      governanceNote:
        'Post-drive artifacts required per driving-intelligence-evidence-governance-2026-09-01.md — not created in ARM phase',
    };

    console.log(JSON.stringify(report, null, 2));

    if (!report.REFERENCE_DRIVE_ARMED) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const payload = {
    REFERENCE_DRIVE_ARMED: false,
    READY_TO_DRIVE: false,
    BLOCKER: error instanceof Error ? error.message : String(error),
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
});
