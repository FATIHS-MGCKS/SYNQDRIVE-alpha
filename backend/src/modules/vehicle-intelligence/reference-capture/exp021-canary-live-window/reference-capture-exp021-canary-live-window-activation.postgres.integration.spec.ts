/**
 * PostgreSQL integration — EXP-021 canary live window activation ledger + arm path.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import {
  Exp021CanaryLiveWindowActivationState,
  Exp021StudyRunState,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import { EXP021_KS_MX_2024_CANARY } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { ReferenceCaptureExp021CanaryLiveWindowActivationService } from './reference-capture-exp021-canary-live-window-activation.service';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';
const T0_MS = Date.parse('2026-09-20T10:00:00.000Z');

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
  const dimoId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, vehicle_id, token_id, created_at, updated_at)
    VALUES (${dimoId}, ${vehicleId}, ${tokenId}, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `.catch(() => undefined);
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

      const service = new ReferenceCaptureExp021CanaryLiveWindowActivationService(
        prisma as never,
        mockConfig as never,
        mockSession as never,
        mockFastGo as never,
        fleetRepo,
      );

      const trip = {
        tripId,
        vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
        organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
        tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 120_000,
        endTimeMs: null,
      };

      const arm = (service as unknown as { armOngoingTrip: (t: typeof trip, ms: number) => Promise<unknown> })
        .armOngoingTrip.bind(service);

      await Promise.all([arm(trip, T0_MS), arm(trip, T0_MS)]);

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
      const service = new ReferenceCaptureExp021CanaryLiveWindowActivationService(
        prisma as never,
        { isEnabled: () => true, isSettlementShadowEnabled: () => true } as never,
        {
          createSession: jest.fn(),
          runPreflight: jest.fn(),
          stopRecording: jest.fn(),
        } as never,
        { executeFastGo: jest.fn() } as never,
        fleetRepo,
      );

      const trip = {
        tripId,
        vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
        organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
        tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 60_000,
        endTimeMs: null,
      };
      const arm = (service as unknown as { armOngoingTrip: (t: typeof trip, ms: number) => Promise<unknown> })
        .armOngoingTrip.bind(service);
      await arm(trip, T0_MS);

      const runsAfter = await prisma.exp021StudyRun.count({ where: { enrollmentId } });
      expect(runsAfter).toBe(runsBefore);

      await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({ where: { vehicleTripId: tripId } });
      await prisma.exp021StudyRun.delete({ where: { id: run.run.id } });
      await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyEnrollment.delete({ where: { id: enrollmentId } });
      await prisma.exp021Study.delete({ where: { id: studyId } });
    });

    it('disabled activation config yields zero coordinator effects', async () => {
      const service = new ReferenceCaptureExp021CanaryLiveWindowActivationService(
        prisma as never,
        { isEnabled: () => true, isSettlementShadowEnabled: () => true } as never,
        { createSession: jest.fn(), runPreflight: jest.fn(), stopRecording: jest.fn() } as never,
        { executeFastGo: jest.fn() } as never,
        fleetRepo,
      );
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
