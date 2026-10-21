/**
 * Phase 3A.2 — controlled LTE_R1 reference-capture production canary.
 *
 * Uses the same ReferenceCaptureSessionService path as the REST controller.
 * Requires REFERENCE_CAPTURE_ENABLED=true and a running PM2 worker process.
 *
 * Usage (on VPS):
 *   cd /opt/synqdrive/current/backend
 *   REFERENCE_CAPTURE_ENABLED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/ops/reference-capture-lte-r1-production-canary.ts \
 *     --organization-id=<orgId> \
 *     --vehicle-id=<vehicleId> \
 *     --target-cycles=5 \
 *     --confirm-production-canary
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { HardwareType, ReferenceCaptureSessionStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { ReferenceCaptureObservationRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-observation.repository';
import { ReferenceCaptureSessionRepository } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';

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

async function selectVehicle(prisma: PrismaService, organizationId: string, vehicleId?: string) {
  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId, hardwareType: HardwareType.LTE_R1 },
      select: {
        id: true,
        licensePlate: true,
        fuelType: true,
        hardwareType: true,
        dimoVehicle: { select: { tokenId: true, connectionStatus: true, lastSignal: true } },
        latestState: { select: { lastSeenAt: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) {
      throw new Error(`Vehicle ${vehicleId} not found or missing DIMO token`);
    }
    return vehicle;
  }

  const candidates = await prisma.vehicle.findMany({
    where: { organizationId, hardwareType: HardwareType.LTE_R1, dimoVehicleId: { not: null } },
    select: {
      id: true,
      licensePlate: true,
      fuelType: true,
      hardwareType: true,
      dimoVehicle: { select: { tokenId: true, connectionStatus: true, lastSignal: true } },
      latestState: { select: { lastSeenAt: true } },
    },
    orderBy: { latestState: { lastSeenAt: 'desc' } },
    take: 10,
  });

  const online = candidates.find(
    (v) => v.dimoVehicle?.tokenId && (v.latestState?.lastSeenAt || v.dimoVehicle.lastSignal),
  );
  if (!online) {
    throw new Error('No LTE_R1 vehicle with DIMO token and recent telemetry found');
  }
  return online;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-production-canary')) {
    throw new Error('Refusing to run without --confirm-production-canary');
  }

  loadEnv();
  if (process.env.REFERENCE_CAPTURE_ENABLED !== 'true') {
    throw new Error('REFERENCE_CAPTURE_ENABLED must be true before running canary');
  }

  const organizationId = parseArg('--organization-id') ?? process.env.ORG_ID;
  if (!organizationId) {
    throw new Error('--organization-id required');
  }

  const targetCycles = Number(parseArg('--target-cycles') ?? '5');
  const vehicleIdArg = parseArg('--vehicle-id');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const sessionService = app.get(ReferenceCaptureSessionService);
  const sessionRepo = app.get(ReferenceCaptureSessionRepository);
  const observationRepo = app.get(ReferenceCaptureObservationRepository);

  try {
    const vehicle = await selectVehicle(prisma, organizationId, vehicleIdArg);
    const tripCountBefore = await prisma.vehicleTrip.count({
      where: { vehicleId: vehicle.id },
    });

    const created = await sessionService.createSession({
      organizationId,
      vehicleId: vehicle.id,
    });

    const preflightView = await sessionService.runPreflight(organizationId, created.id);
    if (preflightView.status !== ReferenceCaptureSessionStatus.READY) {
      throw new Error(
        `Preflight did not reach READY: status=${preflightView.status} blockers=${JSON.stringify(preflightView.readiness?.blockers ?? [])}`,
      );
    }
    if (!preflightView.readiness?.deploymentPreflightReady) {
      throw new Error(`deploymentPreflightReady=false: ${JSON.stringify(preflightView.readiness)}`);
    }

    const started = await sessionService.startRecording(organizationId, created.id);
    const startAt = Date.now();
    const pollMs = 2000;
    const maxWaitMs = Math.max(90_000, targetCycles * 12_000);

    let lastCycleCount = 0;
    while (Date.now() - startAt < maxWaitMs) {
      const session = await sessionRepo.findById(organizationId, created.id);
      const state = (session?.acquisitionStateJson ?? {}) as {
        cycleCount?: number;
        activeCycleJobId?: string | null;
      };
      const cycleCount = state.cycleCount ?? 0;
      if (cycleCount >= targetCycles) break;
      if (cycleCount !== lastCycleCount) {
        console.error(
          `[canary] cycleCount=${cycleCount} activeCycleJobId=${state.activeCycleJobId ?? 'null'}`,
        );
        lastCycleCount = cycleCount;
      }
      await sleep(pollMs);
    }

    const midSession = await sessionRepo.findById(organizationId, created.id);
    const midState = (midSession?.acquisitionStateJson ?? {}) as { cycleCount?: number };
    const cycleCount = midState.cycleCount ?? 0;

    const stopped = await sessionService.stopRecording(organizationId, created.id);
    await sleep(12_000);

    const finalSession = await sessionRepo.findById(organizationId, created.id);
    const observations = await observationRepo.findBySession(organizationId, created.id, {
      limit: 5000,
    });

    const tripCountAfter = await prisma.vehicleTrip.count({
      where: { vehicleId: vehicle.id },
    });

    const finalState = (finalSession?.acquisitionStateJson ?? {}) as {
      activeCycleJobId?: string | null;
    };

    const mapped = observations.filter((o) => o.canonicalKey != null).length;
    const unmapped = observations.filter((o) => o.canonicalKey == null && o.providerField).length;
    const surfaces = observations.reduce<Record<string, number>>((acc, o) => {
      const key = o.acquisitionSurface ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const report = {
      organizationId,
      vehicle: {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate,
        fuelType: vehicle.fuelType,
        hardwareType: vehicle.hardwareType,
        tokenId: vehicle.dimoVehicle?.tokenId,
        connectionStatus: vehicle.dimoVehicle?.connectionStatus,
      },
      sessionId: created.id,
      preflight: {
        status: preflightView.status,
        deploymentPreflightReady: preflightView.readiness?.deploymentPreflightReady,
        availableSignalsCount: preflightView.preflight?.availableSignals?.length ?? null,
        broadObservationFieldCount: preflightView.preflight?.broadObservationFieldCount ?? null,
        powertrainProfile: preflightView.preflight?.powertrainProfile ?? null,
        warnings: preflightView.readiness?.warnings ?? [],
        blockers: preflightView.readiness?.blockers ?? [],
      },
      recording: {
        startedStatus: started.status,
        stoppedStatus: stopped.status,
        finalStatus: finalSession?.status,
        cycleCount,
        activeCycleJobId: finalState.activeCycleJobId ?? null,
        pendingCycleJobId: finalSession?.pendingCycleJobId,
        runnerJobId: finalSession?.runnerJobId,
      },
      observations: {
        total: observations.length,
        mapped,
        unmapped,
        surfaces,
        sequenceMin: (() => {
          const nums = observations.map((o) => o.sequenceNumber).filter((n): n is number => n != null);
          return nums.length ? Math.min(...nums) : null;
        })(),
        sequenceMax: (() => {
          const nums = observations.map((o) => o.sequenceNumber).filter((n): n is number => n != null);
          return nums.length ? Math.max(...nums) : null;
        })(),
        sample: observations.slice(0, 5).map((o) => ({
          providerField: o.providerField,
          canonicalKey: o.canonicalKey,
          rawIdentity: o.rawIdentity,
          temporalClass: o.temporalClass,
          acquisitionSurface: o.acquisitionSurface,
          providerTimestamp: o.providerTimestamp,
          requestStartedAt: o.requestStartedAt,
          synqReceivedAt: o.synqReceivedAt,
          requestCompletedAt: o.requestCompletedAt,
          requestCorrelationId: o.requestCorrelationId,
          sequenceNumber: o.sequenceNumber,
        })),
      },
      productionIsolation: {
        vehicleTripCountBefore: tripCountBefore,
        vehicleTripCountAfter: tripCountAfter,
        newTripsCreated: tripCountAfter - tripCountBefore,
      },
      timestampContract: {
        violations: observations
          .filter((o) => {
            if (!o.requestStartedAt || !o.synqReceivedAt || !o.requestCompletedAt) return false;
            return !(
              o.requestStartedAt <= o.synqReceivedAt &&
              o.synqReceivedAt <= o.requestCompletedAt
            );
          })
          .map((o) => o.id),
      },
    };

    console.log(JSON.stringify(report, null, 2));
    if (cycleCount < 3) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
