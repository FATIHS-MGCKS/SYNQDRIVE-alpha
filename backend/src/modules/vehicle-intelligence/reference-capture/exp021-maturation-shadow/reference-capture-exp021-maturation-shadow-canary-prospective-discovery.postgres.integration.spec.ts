/**
 * PostgreSQL integration — EXP-021 prospective PDI discovery (E5–E8).
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import { PrismaClient } from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
  buildExp021CanaryCohortAuthority,
} from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  executeCanaryEnrollment,
  waitForNextFreshAuthoritativeWindowClose,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { resolveGeometryActivityAuthorityByWindow } from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
import {
  computeCanaryEnrollmentCursorPhysicalEndMs,
  evaluateProspectiveAuthoritativePdiEligibility,
} from './reference-capture-exp021-maturation-shadow-canary-prospective-discovery.lib';
import { EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1 } from './reference-capture-exp021-maturation-shadow.types';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';
const RUNTIME_SHA = 'exp021-prospective-pdi-pg-proof-sha';

const OLD_NOT_BEFORE_ISO = '2026-09-19T13:32:23.000Z';
const NEW_NOT_BEFORE_ISO = '2026-09-19T20:00:00.000Z';

/** Seven-shaped post–OLD_NOT_BEFORE forensic intervals (production audit class; read-only). */
const FORENSIC_SEVEN_SHAPED_TRIPS = [
  { start: '2026-09-19T13:45:00.000Z', end: '2026-09-19T14:02:10.000Z' },
  { start: '2026-09-19T14:10:00.000Z', end: '2026-09-19T14:28:40.000Z' },
  { start: '2026-09-19T14:35:00.000Z', end: '2026-09-19T14:55:00.000Z' },
  { start: '2026-09-19T15:00:00.000Z', end: '2026-09-19T15:27:09.752Z' },
  { start: '2026-09-19T15:40:00.000Z', end: '2026-09-19T16:05:00.000Z' },
  { start: '2026-09-19T16:20:00.000Z', end: '2026-09-19T16:48:00.000Z' },
  { start: '2026-09-19T17:00:00.000Z', end: '2026-09-19T17:35:00.000Z' },
] as const;
const WINDOW_W1 = new Date('2026-09-21T14:00:00.000Z');
const WINDOW_W2 = new Date('2026-09-21T15:00:00.000Z');
const WINDOW_B = new Date('2026-09-21T14:05:00.000Z');
const WINDOW_C = new Date('2026-09-21T14:10:00.000Z');

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

function canaryTripConfirmedExperiment(
  physicalStartAt: string,
  physicalEndAt: string,
  id: string = randomUUID(),
) {
  return {
    id,
    updatedAt: new Date(Date.parse(physicalEndAt) + 379_000),
    metadataJson: {
      physicalDriveInterval: {
        physicalStartAt,
        physicalEndAt,
        source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
      },
    },
  };
}

async function ensureCohortVehicleGraph(prisma: PrismaClient): Promise<void> {
  const organizationId = EXP021_KS_MX_2024_CANARY.organizationId;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Prospective PG Org'}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  for (const member of EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE) {
    const vin = `EXP021PRS${member.tokenId}`.padEnd(17, '0').slice(0, 17);
    await prisma.$executeRaw`
      INSERT INTO vehicles (
        id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
      )
      VALUES (
        ${member.vehicleId}, ${organizationId}, ${vin}, 'Test', 'Prospective', 2024, 'ELECTRIC',
        'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    const externalId = `exp021-prospective-pg-${member.tokenId}`;
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

async function purgeMaturationShadowTables(prisma: PrismaClient): Promise<void> {
  await prisma.exp021MaturationShadowObservationAttempt.deleteMany();
  await prisma.exp021MaturationShadowObservationSlot.deleteMany();
  await prisma.exp021MaturationShadowWindow.deleteMany();
  await prisma.exp021MaturationShadowWindowFamily.deleteMany();
}

(LIVE ? describe : describe.skip)(
  'EXP-021 prospective PDI discovery PostgreSQL integration (E5–E8)',
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
      process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO = OLD_NOT_BEFORE_ISO;
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

    const oldActivationNotBeforeMs = Date.parse(OLD_NOT_BEFORE_ISO);
    const newActivationNotBeforeMs = Date.parse(NEW_NOT_BEFORE_ISO);

    async function enrollProspectiveLate(
      tokenId: number,
      canonicalWindowTo: Date,
    ): Promise<string> {
      const lateNow = new Date(canonicalWindowTo.getTime() + 400_000);
      const result = await executeCanaryEnrollment({
        args: { tokenId, execute: true, waitNextWindow: false },
        config,
        cohort,
        repository,
        enrollment,
        canonicalWindowTo,
        now: lateNow,
        authoritativeWindowMatch: true,
        enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
        activityAuthorityByGeometry: activityAuthority(canonicalWindowTo),
      });
      if (!('familyId' in result)) {
        throw new Error('Expected family enrollment');
      }
      return result.familyId;
    }

    it('E5_PDI_APPEARS_AFTER_INITIAL_POLL_POSTGRES — late PDI prospective execute persists family', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      const familyId = await enrollProspectiveLate(mx.tokenId, WINDOW_W1);
      expect(familyId).toBeTruthy();
      const count = await prisma.exp021MaturationShadowWindowFamily.count({
        where: { vehicleId: mx.vehicleId, canonicalWindowTo: WINDOW_W1 },
      });
      expect(count).toBe(1);
    });

    it('E6_RESTART_UNENROLLED_WINDOW_SURVIVES_POSTGRES — cursor from enrolled max, wait selects next window', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      await enrollProspectiveLate(mx.tokenId, WINDOW_W1);
      const maxEnrolled = await repository.maxEnrolledCanonicalWindowToMsForVehicle(
        mx.organizationId,
        mx.vehicleId,
        mx.tokenId,
      );
      expect(maxEnrolled).toBe(WINDOW_W1.getTime());
      const cursor = computeCanaryEnrollmentCursorPhysicalEndMs({
        maxEnrolledCanonicalWindowToMs: maxEnrolled,
        activationNotBeforeMs: oldActivationNotBeforeMs,
      });
      expect(cursor).toBe(WINDOW_W1.getTime());

      const experiments = [
        canaryTripConfirmedExperiment(
          '2026-09-21T13:55:00.000Z',
          WINDOW_W1.toISOString(),
        ),
        canaryTripConfirmedExperiment(
          '2026-09-21T14:55:00.000Z',
          WINDOW_W2.toISOString(),
        ),
      ];
      const wait = await waitForNextFreshAuthoritativeWindowClose(
        {
          listSettlementShadowExperiments: async () => experiments,
          sleep: async () => undefined,
          now: () => new Date(WINDOW_W2.getTime() + 400_000),
          config,
          tokenId: mx.tokenId,
        },
        {
          afterPhysicalEndMs: cursor,
          activationNotBeforeMs: oldActivationNotBeforeMs,
          enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
          timeoutMs: 5_000,
          pollMs: 1,
        },
      );
      expect(wait.canonicalWindowTo.getTime()).toBe(WINDOW_W2.getTime());
    });

    it('E7_THREE_VEHICLE_DELAYED_PDI_POSTGRES — three vehicles, one family each', async () => {
      const [mx, ms, wob] = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE;
      const ids = await Promise.all([
        enrollProspectiveLate(mx.tokenId, WINDOW_W1),
        enrollProspectiveLate(ms.tokenId, WINDOW_B),
        enrollProspectiveLate(wob.tokenId, WINDOW_C),
      ]);
      expect(new Set(ids).size).toBe(3);
      expect(await prisma.exp021MaturationShadowWindowFamily.count()).toBe(3);
    });

    it('E8_DUPLICATE_CONCURRENT_ENROLLMENT_POSTGRES — concurrent execute converges to one family', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      const [first, second] = await Promise.all([
        enrollProspectiveLate(mx.tokenId, WINDOW_W1),
        enrollProspectiveLate(mx.tokenId, WINDOW_W1),
      ]);
      expect(first).toBe(second);
      expect(
        await prisma.exp021MaturationShadowWindowFamily.count({
          where: { vehicleId: mx.vehicleId, canonicalWindowTo: WINDOW_W1 },
        }),
      ).toBe(1);
    });

    it('ANTI_BACKFILL_POSTGRES — NEW NOT_BEFORE rejects seven-shaped forensic PDIs; new trip enrolls once', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      const startupCursor = computeCanaryEnrollmentCursorPhysicalEndMs({
        maxEnrolledCanonicalWindowToMs: null,
        activationNotBeforeMs: newActivationNotBeforeMs,
      });
      expect(startupCursor).toBe(newActivationNotBeforeMs - 1);

      for (const trip of FORENSIC_SEVEN_SHAPED_TRIPS) {
        const physicalEndMs = Date.parse(trip.end);
        const eligibility = evaluateProspectiveAuthoritativePdiEligibility({
          authority: {
            physicalStartAt: trip.start,
            physicalEndAt: trip.end,
            source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
          },
          physicalEndMs,
          activationNotBeforeMs: newActivationNotBeforeMs,
          enrollmentCursorPhysicalEndMs: startupCursor,
        });
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.rejectionReason).toBe('physical_start_before_activation_not_before');
      }

      const endAfterNewStartBeforeNew = {
        start: '2026-09-19T19:30:00.000Z',
        end: '2026-09-19T20:30:00.000Z',
      };
      const splitEpoch = evaluateProspectiveAuthoritativePdiEligibility({
        authority: {
          physicalStartAt: endAfterNewStartBeforeNew.start,
          physicalEndAt: endAfterNewStartBeforeNew.end,
          source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
        },
        physicalEndMs: Date.parse(endAfterNewStartBeforeNew.end),
        activationNotBeforeMs: newActivationNotBeforeMs,
        enrollmentCursorPhysicalEndMs: startupCursor,
      });
      expect(splitEpoch.eligible).toBe(false);
      expect(splitEpoch.rejectionReason).toBe('physical_start_before_activation_not_before');

      const forensicWaitExperiments = FORENSIC_SEVEN_SHAPED_TRIPS.map((trip) =>
        canaryTripConfirmedExperiment(trip.start, trip.end),
      );
      await expect(
        waitForNextFreshAuthoritativeWindowClose(
          {
            listSettlementShadowExperiments: async () => forensicWaitExperiments,
            sleep: async () => undefined,
            now: () => new Date(Date.parse(FORENSIC_SEVEN_SHAPED_TRIPS[0].end) + 400_000),
            config,
            tokenId: mx.tokenId,
          },
          {
            afterPhysicalEndMs: startupCursor,
            activationNotBeforeMs: newActivationNotBeforeMs,
            enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
            timeoutMs: 100,
            pollMs: 1,
          },
        ),
      ).rejects.toThrow('Timed out waiting');

      expect(await prisma.exp021MaturationShadowWindowFamily.count()).toBe(0);

      const forensicEnd = new Date(FORENSIC_SEVEN_SHAPED_TRIPS[0].end);
      const forensicExecuteExperiments = FORENSIC_SEVEN_SHAPED_TRIPS.map((trip) =>
        canaryTripConfirmedExperiment(trip.start, trip.end),
      );
      await expect(
        executeCanaryEnrollment({
          args: { tokenId: mx.tokenId, execute: true, waitNextWindow: false },
          config,
          cohort,
          repository,
          enrollment,
          canonicalWindowTo: forensicEnd,
          now: new Date(forensicEnd.getTime() + 400_000),
          authoritativeWindowMatch: true,
          enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
          activationNotBeforeMs: newActivationNotBeforeMs,
          enrollmentCursorPhysicalEndMs: startupCursor,
          settlementShadowExperiments: forensicExecuteExperiments,
          activityAuthorityByGeometry: activityAuthority(forensicEnd),
        }),
      ).rejects.toThrow('physical_start_before_activation_not_before');

      const newTripEnd = new Date('2026-09-19T21:00:00.000Z');
      const newTripStart = '2026-09-19T20:15:00.000Z';
      const familyId = await enrollProspectiveLate(mx.tokenId, newTripEnd);
      expect(familyId).toBeTruthy();
      expect(await prisma.exp021MaturationShadowWindowFamily.count()).toBe(1);
    });

    it('CURSOR_SCOPE — schedule version isolates enrollment cursor across V1 vs future V2', async () => {
      const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
      await enrollProspectiveLate(mx.tokenId, WINDOW_W1);
      const v1Max = await repository.maxEnrolledCanonicalWindowToMsForVehicle(
        mx.organizationId,
        mx.vehicleId,
        mx.tokenId,
        EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      );
      expect(v1Max).toBe(WINDOW_W1.getTime());
      const v2Max = await repository.maxEnrolledCanonicalWindowToMsForVehicle(
        mx.organizationId,
        mx.vehicleId,
        mx.tokenId,
        'MATURATION_SHADOW_SCHEDULE_v2',
      );
      expect(v2Max).toBeNull();
      const v2Cursor = computeCanaryEnrollmentCursorPhysicalEndMs({
        maxEnrolledCanonicalWindowToMs: v2Max,
        activationNotBeforeMs: newActivationNotBeforeMs,
      });
      expect(v2Cursor).toBe(newActivationNotBeforeMs - 1);
      expect(v2Cursor).toBeLessThan(WINDOW_W1.getTime());
    });
  },
);
