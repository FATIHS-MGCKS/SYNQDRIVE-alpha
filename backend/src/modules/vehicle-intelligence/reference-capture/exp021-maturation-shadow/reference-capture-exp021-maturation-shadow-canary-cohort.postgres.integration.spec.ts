/**
 * PostgreSQL integration — EXP-021 multi-vehicle maturation cohort A1/B1/C1/A2 + restart convergence.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID,
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
  buildExp021CanaryCohortAuthority,
} from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  executeCanaryEnrollment,
  type Exp021CanaryEnrollSuccess,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { resolveGeometryActivityAuthorityByWindow } from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import type { Exp021MaturationShadowAttemptRawFacts } from './reference-capture-exp021-maturation-shadow.types';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';
const RUNTIME_SHA = 'exp021-cohort-postgres-proof-sha';

const WINDOW_A1 = new Date('2026-09-21T10:00:00.000Z');
const WINDOW_B1 = new Date('2026-09-21T10:05:00.000Z');
const WINDOW_C1 = new Date('2026-09-21T10:10:00.000Z');
const WINDOW_A2 = new Date('2026-09-21T11:00:00.000Z');

function makeCohortConfig(): ReferenceCaptureConfig {
  const tokenIds = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE.map((m) => m.tokenId);
  return {
    isExp021MaturationShadowEnabled: () => true,
    isExp021MaturationShadowHfLaneEnabled: () => true,
    isExp021MaturationShadowSettlementLaneEnabled: () => true,
    getExp021MaturationShadowAllowlistTokenIds: () => [...tokenIds].sort((a, b) => a - b),
    getExp021MaturationShadowMaxActiveFamilies: () => tokenIds.length,
    getHfRecoveryPolicyConfig: () => ({
      mode: 'V2' as const,
      settlementDelayMs: 8_000,
      recoveryOverlapMs: 6_000,
      hfHistoricalPollIntervalMs: 30_000,
      recoverySweepEnabled: false,
      recoverySweepIntervalMs: 60_000,
      recoverySweepLookbackMs: 300_000,
      canaryOnly: false,
      canaryTokenIds: [],
      availabilityCalibrationEnabled: false,
    }),
  } as unknown as ReferenceCaptureConfig;
}

function freshNow(canonicalWindowTo: Date): Date {
  return new Date(canonicalWindowTo.getTime() + 2_000);
}

function activityAuthority(canonicalWindowTo: Date) {
  return resolveGeometryActivityAuthorityByWindow(
    [
      {
        providerField: 'speed',
        providerTimestamp: new Date(canonicalWindowTo.getTime() - 5_000),
        normalizedValueJson: 42,
      },
    ],
    canonicalWindowTo,
  );
}

async function ensureCohortVehicleGraph(prisma: PrismaClient): Promise<void> {
  const organizationId = EXP021_KS_MX_2024_CANARY.organizationId;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Cohort PG Org'}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  for (const member of EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE) {
    const vin = `EXP021COH${member.tokenId}`.padEnd(17, '0').slice(0, 17);
    await prisma.$executeRaw`
      INSERT INTO vehicles (
        id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
      )
      VALUES (
        ${member.vehicleId}, ${organizationId}, ${vin}, 'Test', 'Cohort', 2024, 'ELECTRIC',
        'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    const externalId = `exp021-cohort-pg-${member.tokenId}`;
    const dimo = await prisma.dimoVehicle.upsert({
      where: { tokenId: member.tokenId },
      create: {
        id: randomUUID(),
        externalId,
        tokenId: member.tokenId,
        connectionStatus: 'CONNECTED',
      },
      update: {},
      select: { id: true },
    });
    await prisma.$executeRaw`
      UPDATE vehicles SET dimo_vehicle_id = NULL
      WHERE dimo_vehicle_id = ${dimo.id} AND id <> ${member.vehicleId}
    `;
    await prisma.$executeRaw`
      UPDATE vehicles SET dimo_vehicle_id = ${dimo.id} WHERE id = ${member.vehicleId}
    `;
  }
}

async function seedForensicTripWithoutPdi(prisma: PrismaClient): Promise<void> {
  const vehicleId = EXP021_KS_MX_2024_CANARY.vehicleId;
  const tripId = EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID;
  await prisma.vehicleTrip.upsert({
    where: { id: tripId },
    create: {
      id: tripId,
      vehicleId,
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date('2026-09-18T08:00:00.000Z'),
      endTime: new Date('2026-09-18T08:30:00.000Z'),
    },
    update: {},
  });
}

async function purgeMaturationShadowTables(prisma: PrismaClient): Promise<void> {
  await prisma.exp021MaturationShadowObservationAttempt.deleteMany();
  await prisma.exp021MaturationShadowObservationSlot.deleteMany();
  await prisma.exp021MaturationShadowWindow.deleteMany();
  await prisma.exp021MaturationShadowWindowFamily.deleteMany();
}

function successAttemptRawFacts(
  stratum: { windowTo: Date; querySemanticsHash: string; signalSetHash: string },
  plannedAgeMs: number,
): Exp021MaturationShadowAttemptRawFacts {
  const requestStartedAt = new Date(stratum.windowTo.getTime() + plannedAgeMs);
  return {
    plannedAgeMs,
    requestStartedAt,
    requestCompletedAt: new Date(requestStartedAt.getTime() + 400),
    runtimeBuildSha: RUNTIME_SHA,
    querySemanticsHash: stratum.querySemanticsHash,
    signalSetHash: stratum.signalSetHash,
    providerRequestSucceeded: true,
    providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
    providerStatus: 'ZERO_RESULT',
    providerErrorClass: null,
    uniqueBucketLocusCount: 0,
    perFieldRowCountJson: {},
    perFieldBucketLocusCountJson: {},
    bucketLocusManifestJson: [],
    queryProvenanceJson: { adapter: 'cohort-postgres-proof' },
  };
}

async function markFamilyFullyObserved(
  repository: ReferenceCaptureExp021MaturationShadowRepository,
  prisma: PrismaClient,
  familyId: string,
): Promise<void> {
  const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
    where: { stratum: { windowFamilyId: familyId } },
    include: { stratum: true },
  });
  for (const slot of slots) {
    await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: successAttemptRawFacts(slot.stratum, slot.plannedAgeMs),
    });
  }
}

async function enrollViaCanary(
  input: {
    tokenId: number;
    canonicalWindowTo: Date;
    config: ReferenceCaptureConfig;
    cohort: ReturnType<typeof buildExp021CanaryCohortAuthority>;
    repository: ReferenceCaptureExp021MaturationShadowRepository;
    enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  },
): Promise<Exp021CanaryEnrollSuccess> {
  const result = await executeCanaryEnrollment({
    args: { tokenId: input.tokenId, execute: true, waitNextWindow: false },
    config: input.config,
    cohort: input.cohort,
    repository: input.repository,
    enrollment: input.enrollment,
    canonicalWindowTo: input.canonicalWindowTo,
    now: freshNow(input.canonicalWindowTo),
    authoritativeWindowMatch: true,
    activityAuthorityByGeometry: activityAuthority(input.canonicalWindowTo),
  });
  if (!('familyId' in result)) {
    throw new Error('Expected execute enrollment success with familyId');
  }
  return result;
}

(LIVE ? describe : describe.skip)(
  'EXP-021 multi-vehicle maturation cohort PostgreSQL integration (A1/B1/C1/A2)',
  () => {
    let prisma: PrismaClient;
    let repository: ReferenceCaptureExp021MaturationShadowRepository;
    let enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
    let config: ReferenceCaptureConfig;
    let cohort: ReturnType<typeof buildExp021CanaryCohortAuthority>;
    let memoryServer: RedisMemoryServer;
    let connection: IORedis;
    let queue: Queue;

    beforeAll(async () => {
      process.env.GITHUB_SHA = RUNTIME_SHA;
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        const message = 'REFERENCE_CAPTURE_POSTGRES_INTEGRATION requires isolated Postgres';
        if (REQUIRED) throw new Error(message);
        throw new Error(`${message} (LOCAL_SKIP)`);
      }
      prisma = new PrismaClient();
      repository = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);
      config = makeCohortConfig();
      cohort = buildExp021CanaryCohortAuthority([...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE])!;

      memoryServer = new RedisMemoryServer();
      await memoryServer.start();
      connection = new IORedis({
        host: await memoryServer.getHost(),
        port: await memoryServer.getPort(),
        maxRetriesPerRequest: null,
      });
      queue = new Queue(QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW, { connection });
      const runner = new ReferenceCaptureExp021MaturationShadowRunnerService(
        queue,
        repository,
        config,
      );
      enrollment = new ReferenceCaptureExp021MaturationShadowEnrollmentService(
        config,
        repository,
        runner,
      );

      await ensureCohortVehicleGraph(prisma);
      await seedForensicTripWithoutPdi(prisma);
    }, 120_000);

    afterAll(async () => {
      await queue?.close();
      await connection?.quit();
      await memoryServer?.stop();
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      await purgeMaturationShadowTables(prisma);
    });

    it('A1→B1→C1→A2 via executeCanaryEnrollment with real PostgreSQL persistence', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      const ms = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[1];
      const wob = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[2];

      const [raceA, raceB] = await Promise.all([
        enrollViaCanary({
          tokenId: mx.tokenId,
          canonicalWindowTo: WINDOW_A1,
          config,
          cohort,
          repository,
          enrollment,
        }),
        enrollViaCanary({
          tokenId: mx.tokenId,
          canonicalWindowTo: WINDOW_A1,
          config,
          cohort,
          repository,
          enrollment,
        }),
      ]);
      expect(raceA.familyId).toBe(raceB.familyId);
      const a1 = raceA;
      expect(
        await prisma.exp021MaturationShadowWindowFamily.count({
          where: { vehicleId: mx.vehicleId, canonicalWindowTo: WINDOW_A1 },
        }),
      ).toBe(1);

      const b1 = await enrollViaCanary({
        tokenId: ms.tokenId,
        canonicalWindowTo: WINDOW_B1,
        config,
        cohort,
        repository,
        enrollment,
      });
      const c1 = await enrollViaCanary({
        tokenId: wob.tokenId,
        canonicalWindowTo: WINDOW_C1,
        config,
        cohort,
        repository,
        enrollment,
      });

      expect(a1.familyId).not.toBe(b1.familyId);
      expect(b1.familyId).not.toBe(c1.familyId);
      expect(a1.familyId).not.toBe(c1.familyId);

      const unfinishedMxAfterA1 = await repository.countUnfinishedFamiliesForVehicle(mx.vehicleId);
      expect(unfinishedMxAfterA1).toBe(1);
      const unfinishedMsAfterB1 = await repository.countUnfinishedFamiliesForVehicle(ms.vehicleId);
      expect(unfinishedMsAfterB1).toBe(1);

      await markFamilyFullyObserved(repository, prisma, a1.familyId);

      const a2 = await enrollViaCanary({
        tokenId: mx.tokenId,
        canonicalWindowTo: WINDOW_A2,
        config,
        cohort,
        repository,
        enrollment,
      });
      expect(a2.familyId).not.toBe(a1.familyId);

      const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
        where: { organizationId: mx.organizationId },
      });
      expect(families).toHaveLength(4);

      const countByVehicleWindow = (vehicleId: string, canonicalWindowTo: Date) =>
        families.filter(
          (f) => f.vehicleId === vehicleId && f.canonicalWindowTo.getTime() === canonicalWindowTo.getTime(),
        ).length;

      expect(countByVehicleWindow(mx.vehicleId, WINDOW_A1)).toBe(1);
      expect(countByVehicleWindow(ms.vehicleId, WINDOW_B1)).toBe(1);
      expect(countByVehicleWindow(wob.vehicleId, WINDOW_C1)).toBe(1);
      expect(countByVehicleWindow(mx.vehicleId, WINDOW_A2)).toBe(1);

      const strata = await prisma.exp021MaturationShadowWindow.findMany();
      const strataKeys = strata.map(
        (s) => `${s.windowFamilyId}:${s.signalLane}:${s.queryGeometryMs}`,
      );
      expect(new Set(strataKeys).size).toBe(strata.length);

      const slots = await prisma.exp021MaturationShadowObservationSlot.findMany();
      const slotKeys = slots.map((s) => `${s.windowStratumId}:${s.plannedAgeMs}`);
      expect(new Set(slotKeys).size).toBe(slots.length);

      const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany();
      const attemptKeys = attempts.map((a) => `${a.observationSlotId}:${a.attemptOrdinal}`);
      expect(new Set(attemptKeys).size).toBe(attempts.length);

      const tokenContamination = families.some(
        (f) =>
          (f.vehicleId === mx.vehicleId && f.tokenId !== mx.tokenId) ||
          (f.vehicleId === ms.vehicleId && f.tokenId !== ms.tokenId) ||
          (f.vehicleId === wob.vehicleId && f.tokenId !== wob.tokenId),
      );
      expect(tokenContamination).toBe(false);

      const forensicTrip = await prisma.vehicleTrip.findUnique({
        where: { id: EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID },
      });
      expect(forensicTrip).toBeTruthy();
      const rawMeta = forensicTrip?.rawDetectionMeta as Record<string, unknown> | null;
      expect(rawMeta?.physicalDriveInterval).toBeUndefined();

      const m2FamiliesForForensicEnd = await prisma.exp021MaturationShadowWindowFamily.count({
        where: {
          vehicleId: mx.vehicleId,
          canonicalWindowTo: forensicTrip!.endTime!,
        },
      });
      expect(m2FamiliesForForensicEnd).toBe(0);
    });

    it('restart convergence: replay A1 idempotent then accepts A2 with new enrollment service', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      const a1 = await enrollViaCanary({
        tokenId: mx.tokenId,
        canonicalWindowTo: WINDOW_A1,
        config,
        cohort,
        repository,
        enrollment,
      });

      const runner2 = new ReferenceCaptureExp021MaturationShadowRunnerService(
        queue,
        repository,
        config,
      );
      const enrollmentRestarted = new ReferenceCaptureExp021MaturationShadowEnrollmentService(
        config,
        repository,
        runner2,
      );

      await markFamilyFullyObserved(repository, prisma, a1.familyId);

      const replay = await enrollmentRestarted.enrollWindowFamily({
        organizationId: mx.organizationId,
        vehicleId: mx.vehicleId,
        tokenId: mx.tokenId,
        canonicalWindowTo: WINDOW_A1,
        enrollmentEventId: randomUUID(),
        activityAuthorityByGeometry: activityAuthority(WINDOW_A1),
      });
      expect(replay.familyId).toBe(a1.familyId);
      expect(
        await prisma.exp021MaturationShadowWindowFamily.count({
          where: { vehicleId: mx.vehicleId, canonicalWindowTo: WINDOW_A1 },
        }),
      ).toBe(1);

      const a2 = await enrollViaCanary({
        tokenId: mx.tokenId,
        canonicalWindowTo: WINDOW_A2,
        config,
        cohort,
        repository,
        enrollment: enrollmentRestarted,
      });
      expect(a2.familyId).not.toBe(a1.familyId);
    });
  },
);
