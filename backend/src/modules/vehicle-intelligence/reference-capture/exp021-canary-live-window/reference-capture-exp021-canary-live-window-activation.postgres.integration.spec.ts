/**
 * PostgreSQL integration — EXP-021 canary live window activation ledger + arm path.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import {
  Exp021CanaryLiveWindowActivationState,
  Exp021StudyRunState,
  PrismaClient,
  ReferenceCaptureSessionStatus,
  TripStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import {
  findAuthoritativePhysicalEndMatch,
  readPhysicalDriveIntervalAuthority,
} from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE } from './reference-capture-exp021-canary-live-window-pdi-publish.lib';
import { EXP021_KS_MX_2024_CANARY } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { ReferenceCaptureSettlementShadowRepository } from '../reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowService } from '../reference-capture-settlement-shadow.service';
import { ReferenceCaptureSessionRepository } from '../reference-capture-session.repository';
import { ReferenceCaptureSessionService } from '../reference-capture-session.service';
import { ReferenceCaptureExp021CanaryLiveWindowActivationService } from './reference-capture-exp021-canary-live-window-activation.service';
import { buildExp021CanaryCohortAuthority } from './reference-capture-exp021-canary-live-window-cohort.lib';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  emptyDataPlane,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';
const T0_MS = Date.parse('2026-09-20T10:00:00.000Z');

function ksMxIntegrationCohort() {
  const { organizationId, vehicleId, tokenId } = EXP021_KS_MX_2024_CANARY;
  return buildExp021CanaryCohortAuthority([{ organizationId, vehicleId, tokenId }])!;
}

async function ensureCanaryVehicleGraph(prisma: PrismaClient): Promise<void> {
  const { organizationId, vehicleId, tokenId } = EXP021_KS_MX_2024_CANARY;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Canary Org'}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  const vin = 'EXP021CANARY00001';
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
    )
    VALUES (
      ${vehicleId}, ${organizationId}, ${vin}, 'Audi', 'MX', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `;
  const externalId = `exp021-canary-${tokenId}`;
  const dimo = await prisma.dimoVehicle.upsert({
    where: { tokenId },
    create: {
      id: randomUUID(),
      externalId,
      tokenId,
      connectionStatus: 'CONNECTED',
    },
    update: {},
    select: { id: true },
  });
  await prisma.$executeRaw`
    UPDATE vehicles SET dimo_vehicle_id = NULL
    WHERE dimo_vehicle_id = ${dimo.id} AND id <> ${vehicleId}
  `;
  await prisma.$executeRaw`
    UPDATE vehicles SET dimo_vehicle_id = ${dimo.id} WHERE id = ${vehicleId}
  `;
}

async function seedStudyEnrollment(
  prisma: PrismaClient,
  fleetRepo: ReferenceCaptureExp021FleetRepository,
): Promise<{ enrollmentId: string; studyId: string }> {
  const study = await fleetRepo.createStudy({
    studyKey: `exp021-canary-lw-${randomUUID()}`,
    dryRun: false,
  });
  const enrollment = await fleetRepo.createEnrollment({
    studyId: study.id,
    organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
    vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
    enrolledTokenId: EXP021_KS_MX_2024_CANARY.tokenId,
    allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
  });
  return { enrollmentId: enrollment.id, studyId: study.id };
}

function createPostgresReferenceCaptureSessionStack(prisma: PrismaClient): {
  sessionService: ReferenceCaptureSessionService;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  settlementRepo: ReferenceCaptureSettlementShadowRepository;
} {
  const config = {
    isEnabled: () => true,
    isSettlementShadowEnabled: () => true,
    getCycleIntervalMs: () => 5000,
    getSlowCycleEvery: () => 6,
    getStopQuiescenceTimeoutMs: () => 15_000,
    getStopQuiescencePollIntervalMs: () => 100,
  };
  const sessionRepo = new ReferenceCaptureSessionRepository(prisma as PrismaService);
  const settlementRepo = new ReferenceCaptureSettlementShadowRepository(prisma as PrismaService);
  const settlementRunner = { enqueueSchedule: jest.fn().mockResolvedValue(undefined) };
  const settlementShadow = new ReferenceCaptureSettlementShadowService(
    config as never,
    settlementRepo,
    settlementRunner as never,
    {} as never,
    {} as never,
    prisma as PrismaService,
  );
  const runner = {
    cancelPendingCycleJob: jest.fn().mockResolvedValue({ cancelled: false, jobId: null }),
    stopRunner: jest.fn().mockResolvedValue(undefined),
    startRunner: jest.fn(),
    sessionRunnerKey: jest.fn(),
  };
  const writer = {
    flush: jest.fn().mockResolvedValue(0),
    clearSession: jest.fn(),
    enqueueAndMaybeFlush: jest.fn(),
  };
  const sessionService = new ReferenceCaptureSessionService(
    config as never,
    sessionRepo,
    { findBySession: jest.fn(), countBySession: jest.fn() } as never,
    { resolveMassBinding: jest.fn() } as never,
    { runPreflight: jest.fn() } as never,
    { captureTick: jest.fn() } as never,
    writer as never,
    { assessSessionReadiness: jest.fn() } as never,
    runner as never,
    settlementShadow,
    prisma as PrismaService,
  );
  return { sessionService, settlementShadow, settlementRepo };
}

function createCanaryActivationService(
  prisma: PrismaClient,
  fleetRepo: ReferenceCaptureExp021FleetRepository,
  overrides?: {
    sessionService?: ReferenceCaptureSessionService;
    fastGo?: { executeFastGo: (args: unknown) => Promise<{ readyToDrive: boolean; blockers: string[] }> };
    settlementShadow?: ReferenceCaptureSettlementShadowService;
  },
): {
  activationService: ReferenceCaptureExp021CanaryLiveWindowActivationService;
  sessionService: ReferenceCaptureSessionService;
  settlementShadow: ReferenceCaptureSettlementShadowService;
} {
  const stack = createPostgresReferenceCaptureSessionStack(prisma);
  const sessionService = overrides?.sessionService ?? stack.sessionService;
  const settlementShadow = overrides?.settlementShadow ?? stack.settlementShadow;
  const activationService = new ReferenceCaptureExp021CanaryLiveWindowActivationService(
    prisma as never,
    { isEnabled: () => true, isSettlementShadowEnabled: () => true } as never,
    sessionService,
    (overrides?.fastGo ?? {
      executeFastGo: jest.fn(async () => ({ readyToDrive: true, blockers: [] })),
    }) as never,
    fleetRepo,
    settlementShadow,
  );
  return { activationService, sessionService, settlementShadow };
}

async function cleanupCanaryFinalizeChain(
  prisma: PrismaClient,
  args: {
    tripId: string;
    sessionId: string;
    studyRunId: string;
    enrollmentId?: string;
    studyId?: string;
    includeStudyGraph?: boolean;
  },
): Promise<void> {
  await prisma.referenceCaptureSettlementShadowSchedule.deleteMany({
    where: { sessionId: args.sessionId },
  });
  await prisma.referenceCaptureSettlementShadowExperiment.deleteMany({
    where: { sessionId: args.sessionId },
  });
  await prisma.referenceCaptureSession.deleteMany({ where: { id: args.sessionId } });
  await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({ where: { vehicleTripId: args.tripId } });
  await prisma.exp021StudyRun.deleteMany({ where: { id: args.studyRunId } });
  await prisma.vehicleTrip.deleteMany({ where: { id: args.tripId } });
  if (args.includeStudyGraph && args.studyId && args.enrollmentId) {
    await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId: args.studyId } });
    await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId: args.studyId } });
    await prisma.exp021StudyEnrollment.delete({ where: { id: args.enrollmentId } }).catch(() => undefined);
    await prisma.exp021Study.delete({ where: { id: args.studyId } }).catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)(
  'EXP-021 canary live window activation PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let fleetRepo: ReferenceCaptureExp021FleetRepository;

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        const message = 'REFERENCE_CAPTURE_POSTGRES_INTEGRATION requires isolated Postgres';
        if (REQUIRED) throw new Error(message);
        throw new Error(`${message} (LOCAL_SKIP)`);
      }
      prisma = new PrismaClient();
      fleetRepo = new ReferenceCaptureExp021FleetRepository(prisma as never);
      await ensureCanaryVehicleGraph(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('concurrent vehicle_trip_id claim converges to exactly one ledger row', async () => {
      const tripId = randomUUID();
      const canary = EXP021_KS_MX_2024_CANARY;
      const before = await prisma.exp021CanaryLiveWindowActivationLedger.count();

      const createClaim = () =>
        prisma.exp021CanaryLiveWindowActivationLedger.create({
          data: {
            organizationId: canary.organizationId,
            vehicleId: canary.vehicleId,
            tokenId: canary.tokenId,
            vehicleTripId: tripId,
            state: Exp021CanaryLiveWindowActivationState.CLAIMED,
            activationNotBeforeAt: new Date(T0_MS),
            tripStartTime: new Date(T0_MS + 60_000),
          },
        });

      const results = await Promise.allSettled([createClaim(), createClaim()]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const after = await prisma.exp021CanaryLiveWindowActivationLedger.count();
      expect(after - before).toBe(1);

      await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({ where: { vehicleTripId: tripId } });
    });

    it('two concurrent arm attempts yield one study run and one RC session (mocked side effects)', async () => {
      const { enrollmentId, studyId } = await seedStudyEnrollment(prisma, fleetRepo);
      const tripId = randomUUID();
      await prisma.vehicleTrip.create({
        data: {
          id: tripId,
          vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(T0_MS + 120_000),
        },
      });

      const runsBefore = await prisma.exp021StudyRun.count({ where: { enrollmentId } });
      const sessionsBefore = await prisma.referenceCaptureSession.count({
        where: { vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId },
      });
      const ledgersBefore = await prisma.exp021CanaryLiveWindowActivationLedger.count({
        where: { vehicleTripId: tripId },
      });

      const mockConfig = {
        isEnabled: () => true,
        isSettlementShadowEnabled: () => true,
      };
      let sessionCreateCount = 0;
      const mockSession = {
        createSession: jest.fn(async (input: { sessionId?: string }) => {
          sessionCreateCount += 1;
          const id = input.sessionId ?? randomUUID();
          await prisma.referenceCaptureSession.create({
            data: {
              id,
              organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
              vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
              connectionProfile: 'DIMO',
              manifestId: `m-${id.slice(0, 8)}`,
              manifestVersion: '1',
              recorderSoftwareVersion: 'test',
              status: 'PREFLIGHT',
            },
          });
          return { id };
        }),
        runPreflight: jest.fn(async () => undefined),
        stopRecording: jest.fn(async () => ({ id: randomUUID() })),
      };
      const mockFastGo = {
        executeFastGo: jest.fn(async () => ({ readyToDrive: true, blockers: [] })),
      };

      const { activationService: service } = createCanaryActivationService(prisma, fleetRepo, {
        sessionService: mockSession as never,
        fastGo: mockFastGo as never,
      });

      const trip = {
        tripId,
        vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
        organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
        tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 120_000,
        endTimeMs: null,
      };

      const cohort = ksMxIntegrationCohort();
      const arm = (service as unknown as {
        armOngoingTrip: (t: typeof trip, ms: number, c: typeof cohort) => Promise<unknown>;
      }).armOngoingTrip.bind(service);

      await Promise.all([arm(trip, T0_MS, cohort), arm(trip, T0_MS, cohort)]);

      const runsAfter = await prisma.exp021StudyRun.count({ where: { enrollmentId } });
      const sessionsAfter = await prisma.referenceCaptureSession.count({
        where: { vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId },
      });
      const ledgersAfter = await prisma.exp021CanaryLiveWindowActivationLedger.count({
        where: { vehicleTripId: tripId },
      });

      expect(ledgersAfter - ledgersBefore).toBe(1);
      expect(runsAfter - runsBefore).toBe(1);
      expect(sessionsAfter - sessionsBefore).toBe(1);
      expect(sessionCreateCount).toBe(1);

      const ledger = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripId },
      });
      expect(ledger?.state).toBe(Exp021CanaryLiveWindowActivationState.RECORDING_STARTED);

      await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({ where: { vehicleTripId: tripId } });
      await prisma.exp021StudyRun.deleteMany({ where: { enrollmentId } });
      await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyEnrollment.delete({ where: { id: enrollmentId } });
      await prisma.exp021Study.delete({ where: { id: studyId } });
      await prisma.vehicleTrip.delete({ where: { id: tripId } });
    });

    it('retry after RECORDING_STARTED does not create duplicate study run', async () => {
      const { enrollmentId, studyId } = await seedStudyEnrollment(prisma, fleetRepo);
      const tripId = randomUUID();
      const sessionId = randomUUID();
      const run = await fleetRepo.reserveStudyRunAssignment({
        enrollmentId,
        resolvedTokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      });

      await prisma.exp021CanaryLiveWindowActivationLedger.create({
        data: {
          organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
          vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
          tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
          vehicleTripId: tripId,
          studyRunId: run.run.id,
          sessionId,
          state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
          activationNotBeforeAt: new Date(T0_MS),
          tripStartTime: new Date(T0_MS + 60_000),
        },
      });

      const runsBefore = await prisma.exp021StudyRun.count({ where: { enrollmentId } });
      const { activationService: service } = createCanaryActivationService(prisma, fleetRepo, {
        sessionService: {
          createSession: jest.fn(),
          runPreflight: jest.fn(),
          stopRecording: jest.fn(),
        } as never,
      });

      const trip = {
        tripId,
        vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
        organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
        tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 60_000,
        endTimeMs: null,
      };
      const cohort = ksMxIntegrationCohort();
      const arm = (service as unknown as {
        armOngoingTrip: (t: typeof trip, ms: number, c: typeof cohort) => Promise<unknown>;
      }).armOngoingTrip.bind(service);
      await arm(trip, T0_MS, cohort);

      const runsAfter = await prisma.exp021StudyRun.count({ where: { enrollmentId } });
      expect(runsAfter).toBe(runsBefore);

      await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({ where: { vehicleTripId: tripId } });
      await prisma.exp021StudyRun.delete({ where: { id: run.run.id } });
      await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyEnrollment.delete({ where: { id: enrollmentId } });
      await prisma.exp021Study.delete({ where: { id: studyId } });
    });

    it('CANARY_POSTGRES_LIVE_SHAPED: arm → RECORDING → trip COMPLETED → finalize publishes PDI (no manual persist)', async () => {
      const { enrollmentId, studyId } = await seedStudyEnrollment(prisma, fleetRepo);
      const canary = EXP021_KS_MX_2024_CANARY;
      const tripId = randomUUID();
      const tripStart = new Date(T0_MS + 120_000);
      const tripEnd = new Date(T0_MS + 600_000);

      await prisma.vehicleTrip.create({
        data: {
          id: tripId,
          vehicleId: canary.vehicleId,
          tripStatus: TripStatus.ONGOING,
          startTime: tripStart,
        },
      });

      const { activationService, sessionService } = createCanaryActivationService(prisma, fleetRepo, {
        fastGo: {
          executeFastGo: jest.fn(async ({ sessionId }: { sessionId: string }) => {
            await prisma.referenceCaptureSession.update({
              where: { id: sessionId },
              data: {
                status: ReferenceCaptureSessionStatus.RECORDING,
                startedAt: tripStart,
                acquisitionStateJson: emptyDataPlane(tripStart.getTime()) as object,
              },
            });
            return { readyToDrive: true, blockers: [] };
          }),
        },
      });

      const ongoingSnapshot = {
        tripId,
        vehicleId: canary.vehicleId,
        organizationId: canary.organizationId,
        tokenId: canary.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: tripStart.getTime(),
        endTimeMs: null,
      };

      const cohort = ksMxIntegrationCohort();
      const arm = (activationService as unknown as {
        armOngoingTrip: (
          t: typeof ongoingSnapshot,
          ms: number,
          c: typeof cohort,
        ) => Promise<{ sessionId: string }>;
      }).armOngoingTrip.bind(activationService);
      const armed = await arm(ongoingSnapshot, T0_MS, cohort);
      const sessionId = armed.sessionId;

      const ledgerAfterArm = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripId },
      });
      expect(ledgerAfterArm?.state).toBe(Exp021CanaryLiveWindowActivationState.RECORDING_STARTED);
      expect(ledgerAfterArm?.sessionId).toBe(sessionId);
      expect(await prisma.exp021StudyRun.count({ where: { canaryActivationVehicleTripId: tripId } })).toBe(1);

      await prisma.vehicleTrip.update({
        where: { id: tripId },
        data: { tripStatus: TripStatus.COMPLETED, endTime: tripEnd },
      });

      const completedSnapshot = {
        ...ongoingSnapshot,
        tripStatus: 'COMPLETED' as const,
        endTimeMs: tripEnd.getTime(),
      };

      const finalize = (activationService as unknown as {
        finalizeCompletedTrip: (
          t: typeof completedSnapshot,
          sid: string,
          notBeforeMs: number,
          c: typeof cohort,
        ) => Promise<void>;
      }).finalizeCompletedTrip.bind(activationService);

      await finalize(completedSnapshot, sessionId, T0_MS, cohort);
      await finalize(completedSnapshot, sessionId, T0_MS, cohort);

      const ledger = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripId },
      });
      expect(ledger?.state).toBe(Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN);

      const sessionRow = await prisma.referenceCaptureSession.findUnique({ where: { id: sessionId } });
      expect(sessionRow?.status).toBe(ReferenceCaptureSessionStatus.COMPLETED);

      const experiment = await prisma.referenceCaptureSettlementShadowExperiment.findFirst({
        where: { sessionId },
      });
      expect(experiment).not.toBeNull();
      const authority = readPhysicalDriveIntervalAuthority(experiment?.metadataJson);
      expect(authority).not.toBeNull();
      expect(authority?.physicalStartAt).toBe(tripStart.toISOString());
      expect(authority?.physicalEndAt).toBe(tripEnd.toISOString());
      expect(authority?.source).toBe(EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE);

      const maturationMatch = findAuthoritativePhysicalEndMatch(
        tripEnd,
        [{ metadataJson: experiment!.metadataJson as never }],
      );
      expect(maturationMatch.authoritativeWindowMatch).toBe(true);

      const studyRun = await prisma.exp021StudyRun.findFirst({
        where: { canaryActivationVehicleTripId: tripId },
      });

      await cleanupCanaryFinalizeChain(prisma, {
        tripId,
        sessionId,
        studyRunId: studyRun!.id,
        enrollmentId,
        studyId,
        includeStudyGraph: true,
      });
    });

    it('CANARY_POSTGRES_FINALIZE: COMPLETED adoption and STOPPING recovery without ledger FAILED', async () => {
      const { enrollmentId, studyId } = await seedStudyEnrollment(prisma, fleetRepo);
      const canary = EXP021_KS_MX_2024_CANARY;
      const tripStart = new Date(T0_MS + 180_000);
      const tripEnd = new Date(T0_MS + 660_000);

      const tripCompletedId = randomUUID();
      const sessionCompletedId = randomUUID();
      const runCompleted = await fleetRepo.reserveStudyRunForCanaryActivation({
        enrollmentId,
        resolvedTokenId: canary.tokenId,
        canaryActivationVehicleTripId: tripCompletedId,
      });
      await prisma.vehicleTrip.create({
        data: {
          id: tripCompletedId,
          vehicleId: canary.vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
        },
      });
      await prisma.exp021CanaryLiveWindowActivationLedger.create({
        data: {
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          tokenId: canary.tokenId,
          vehicleTripId: tripCompletedId,
          studyRunId: runCompleted.run.id,
          sessionId: sessionCompletedId,
          state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
          activationNotBeforeAt: new Date(T0_MS),
          tripStartTime: tripStart,
        },
      });
      await prisma.referenceCaptureSession.create({
        data: {
          id: sessionCompletedId,
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          connectionProfile: 'DIMO',
          manifestId: 'm-completed',
          manifestVersion: '1',
          recorderSoftwareVersion: 'test',
          status: ReferenceCaptureSessionStatus.COMPLETED,
          startedAt: tripStart,
          stoppedAt: tripEnd,
          completedAt: tripEnd,
          acquisitionStateJson: emptyDataPlane(tripStart.getTime()) as object,
        },
      });

      const { activationService, sessionService } = createCanaryActivationService(prisma, fleetRepo);
      const cohort = ksMxIntegrationCohort();
      const finalize = (activationService as unknown as {
        finalizeCompletedTrip: (
          t: {
            tripId: string;
            vehicleId: string;
            organizationId: string;
            tokenId: number;
            tripStatus: 'COMPLETED';
            startTimeMs: number;
            endTimeMs: number;
          },
          sid: string,
          notBeforeMs: number,
          c: typeof cohort,
        ) => Promise<void>;
      }).finalizeCompletedTrip.bind(activationService);

      const tripSnap = {
        tripId: tripCompletedId,
        vehicleId: canary.vehicleId,
        organizationId: canary.organizationId,
        tokenId: canary.tokenId,
        tripStatus: 'COMPLETED' as const,
        startTimeMs: tripStart.getTime(),
        endTimeMs: tripEnd.getTime(),
      };

      const stopSpy = jest.spyOn(sessionService, 'stopRecording');
      const resumeSpy = jest.spyOn(sessionService, 'resumeRecordingStop');
      await finalize(tripSnap, sessionCompletedId, T0_MS, cohort);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(resumeSpy).not.toHaveBeenCalled();
      const ledgerCompleted = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripCompletedId },
      });
      expect(ledgerCompleted?.state).toBe(Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN);

      const tripStoppingId = randomUUID();
      const sessionStoppingId = randomUUID();
      const runStopping = await fleetRepo.reserveStudyRunForCanaryActivation({
        enrollmentId,
        resolvedTokenId: canary.tokenId,
        canaryActivationVehicleTripId: tripStoppingId,
      });
      await prisma.vehicleTrip.create({
        data: {
          id: tripStoppingId,
          vehicleId: canary.vehicleId,
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
        },
      });
      await prisma.exp021CanaryLiveWindowActivationLedger.create({
        data: {
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          tokenId: canary.tokenId,
          vehicleTripId: tripStoppingId,
          studyRunId: runStopping.run.id,
          sessionId: sessionStoppingId,
          state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
          activationNotBeforeAt: new Date(T0_MS),
          tripStartTime: tripStart,
        },
      });
      await prisma.referenceCaptureSession.create({
        data: {
          id: sessionStoppingId,
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          connectionProfile: 'DIMO',
          manifestId: 'm-stopping',
          manifestVersion: '1',
          recorderSoftwareVersion: 'test',
          status: ReferenceCaptureSessionStatus.STOPPING,
          startedAt: tripStart,
          stoppedAt: tripEnd,
          acquisitionStateJson: emptyDataPlane(tripStart.getTime()) as object,
        },
      });

      stopSpy.mockClear();
      resumeSpy.mockClear();
      await finalize(
        {
          ...tripSnap,
          tripId: tripStoppingId,
        },
        sessionStoppingId,
        T0_MS,
        cohort,
      );
      expect(stopSpy).not.toHaveBeenCalled();
      expect(resumeSpy).toHaveBeenCalledTimes(1);

      const ledgerStopping = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripStoppingId },
      });
      expect(ledgerStopping?.state).not.toBe(Exp021CanaryLiveWindowActivationState.FAILED);
      expect(ledgerStopping?.state).toBe(Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN);
      const sessionStoppingRow = await prisma.referenceCaptureSession.findUnique({
        where: { id: sessionStoppingId },
      });
      expect(sessionStoppingRow?.status).toBe(ReferenceCaptureSessionStatus.COMPLETED);

      stopSpy.mockRestore();
      resumeSpy.mockRestore();

      await cleanupCanaryFinalizeChain(prisma, {
        tripId: tripCompletedId,
        sessionId: sessionCompletedId,
        studyRunId: runCompleted.run.id,
      });
      await cleanupCanaryFinalizeChain(prisma, {
        tripId: tripStoppingId,
        sessionId: sessionStoppingId,
        studyRunId: runStopping.run.id,
        enrollmentId,
        studyId,
        includeStudyGraph: true,
      });
    });

    it('disabled activation config yields zero coordinator effects', async () => {
      const { activationService: service } = createCanaryActivationService(prisma, fleetRepo, {
        sessionService: {
          createSession: jest.fn(),
          runPreflight: jest.fn(),
          stopRecording: jest.fn(),
        } as never,
      });
      const prevEnabled = process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED;
      const prevNotBefore = process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO;
      delete process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED;
      delete process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO;
      const ledgersBefore = await prisma.exp021CanaryLiveWindowActivationLedger.count();
      await service.runActivationTick();
      const ledgersAfter = await prisma.exp021CanaryLiveWindowActivationLedger.count();
      expect(ledgersAfter).toBe(ledgersBefore);
      if (prevEnabled !== undefined) process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED = prevEnabled;
      if (prevNotBefore !== undefined) {
        process.env.EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO = prevNotBefore;
      }
    });
  },
);
