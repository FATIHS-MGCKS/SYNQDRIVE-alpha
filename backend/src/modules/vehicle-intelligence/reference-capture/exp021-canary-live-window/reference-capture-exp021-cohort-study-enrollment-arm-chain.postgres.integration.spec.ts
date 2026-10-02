/**
 * PostgreSQL integration — cohort vehicles armOngoingTrip after study enrollment bootstrap.
 */
import { randomUUID } from 'crypto';
import {
  Exp021CanaryLiveWindowActivationState,
  Exp021StudyStatus,
  Prisma,
  PrismaClient,
  TripStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildExp021CanaryCohortAuthority } from './reference-capture-exp021-canary-live-window-cohort.lib';
import { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import { bootstrapExp021CohortStudyEnrollments } from '../exp021-fleet/reference-capture-exp021-cohort-study-enrollment-bootstrap.lib';
import { EXP021_KS_MX_2024_CANARY } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { ReferenceCaptureExp021CanaryLiveWindowActivationService } from './reference-capture-exp021-canary-live-window-activation.service';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const T0_MS = Date.parse('2026-09-20T12:00:00.000Z');

function buildIsolatedArmChainCohort() {
  const organizationId = EXP021_KS_MX_2024_CANARY.organizationId;
  const members = [
    { label: 'KS MX 2024', organizationId, vehicleId: randomUUID(), tokenId: 881_336 },
    { label: 'KS MS 661', organizationId, vehicleId: randomUUID(), tokenId: 881_361 },
    { label: 'WOB L 7503', organizationId, vehicleId: randomUUID(), tokenId: 881_922 },
  ];
  return { members, cohort: buildExp021CanaryCohortAuthority(members)! };
}

async function ensureCohortVehicleGraph(
  prisma: PrismaClient,
  members: { organizationId: string; vehicleId: string; tokenId: number }[],
): Promise<void> {
  const organizationId = EXP021_KS_MX_2024_CANARY.organizationId;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Arm Chain Org'}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  for (const member of members) {
    const vin = `EXP021ARM${member.tokenId}`.padEnd(17, '0').slice(0, 17);
    await prisma.$executeRaw`
      INSERT INTO vehicles (
        id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
      )
      VALUES (
        ${member.vehicleId}, ${organizationId}, ${vin}, 'Test', 'Arm', 2024, 'ELECTRIC',
        'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    const dimo = await prisma.dimoVehicle.upsert({
      where: { tokenId: member.tokenId },
      create: {
        id: randomUUID(),
        externalId: `exp021-arm-${member.tokenId}`,
        tokenId: member.tokenId,
        connectionStatus: 'CONNECTED',
      },
      update: {},
      select: { id: true },
    });
    await prisma.$executeRaw`
      UPDATE vehicles SET dimo_vehicle_id = ${dimo.id} WHERE id = ${member.vehicleId}
    `;
  }
}

function createArmService(prisma: PrismaClient, fleetRepo: ReferenceCaptureExp021FleetRepository) {
  const mockSession = {
    createSession: jest.fn(async (input: { sessionId?: string; organizationId: string; vehicleId: string }) => {
      const id = input.sessionId ?? randomUUID();
      await prisma.referenceCaptureSession.upsert({
        where: { id },
        create: {
          id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          connectionProfile: 'DIMO',
          manifestId: `m-${id.slice(0, 8)}`,
          manifestVersion: '1',
          recorderSoftwareVersion: 'test',
          status: 'PREFLIGHT',
        },
        update: {},
      });
      return { id };
    }),
    runPreflight: jest.fn(async () => undefined),
    stopRecording: jest.fn(),
  };
  const mockFastGo = {
    executeFastGo: jest.fn(async () => ({ readyToDrive: true, blockers: [] as string[] })),
  };
  return new ReferenceCaptureExp021CanaryLiveWindowActivationService(
    prisma as never,
    { isEnabled: () => true, isSettlementShadowEnabled: () => true } as never,
    mockSession as never,
    mockFastGo as never,
    fleetRepo,
    { scheduleSettlementShadowForSession: jest.fn() } as never,
  );
}

(LIVE ? describe : describe.skip)(
  'EXP-021 cohort arm chain with study enrollment authority',
  () => {
    let prisma: PrismaClient;
    let fleetRepo: ReferenceCaptureExp021FleetRepository;
    let studyKey: string;
    let studyId: string;
    let cohortMembers: ReturnType<typeof buildIsolatedArmChainCohort>['members'];
    let cohort: ReturnType<typeof buildIsolatedArmChainCohort>['cohort'];

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) throw new Error('Postgres integration DB unavailable');
      prisma = new PrismaClient();
      fleetRepo = new ReferenceCaptureExp021FleetRepository(prisma as never);
      const isolated = buildIsolatedArmChainCohort();
      cohortMembers = isolated.members;
      cohort = isolated.cohort;
      await ensureCohortVehicleGraph(prisma, cohortMembers);
      studyKey = `exp021-arm-chain-${randomUUID()}`;
      const study = await fleetRepo.createStudy({
        studyKey,
        dryRun: false,
        status: Exp021StudyStatus.COLLECTING,
      });
      studyId = study.id;
      await bootstrapExp021CohortStudyEnrollments({
        prisma: prisma as never,
        fleetRepository: fleetRepo,
        cohort,
        studyKey,
        execute: true,
      });
    }, 120_000);

    afterAll(async () => {
      if (!prisma) return;
      await prisma.exp021CanaryLiveWindowActivationLedger.deleteMany({
        where: { vehicleId: { in: cohortMembers.map((m) => m.vehicleId) } },
      });
      await prisma.exp021StudyRun.deleteMany({ where: { studyId } });
      await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId } });
      await prisma.exp021StudyEnrollment.deleteMany({ where: { studyId } });
      await prisma.exp021Study.delete({ where: { id: studyId } }).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    });

    async function armMember(label: string): Promise<void> {
      const member = cohortMembers.find((m) => m.label === label)!;
      const tripId = randomUUID();
      await prisma.vehicleTrip.create({
        data: {
          id: tripId,
          vehicleId: member.vehicleId,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(T0_MS + 60_000),
        },
      });
      const service = createArmService(prisma, fleetRepo);
      const trip = {
        tripId,
        vehicleId: member.vehicleId,
        organizationId: member.organizationId,
        tokenId: member.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 60_000,
        endTimeMs: null,
      };
      const arm = (service as unknown as {
        armOngoingTrip: (t: typeof trip, ms: number, c: typeof cohort) => Promise<unknown>;
      }).armOngoingTrip.bind(service);
      const result = await arm(trip, T0_MS, cohort);
      expect(result).toMatchObject({ sessionId: expect.any(String), studyRunId: expect.any(String) });
      const ledger = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripId },
      });
      expect(ledger?.state).toBe(Exp021CanaryLiveWindowActivationState.RECORDING_STARTED);
      expect(ledger?.failureReason).toBeNull();
      await prisma.vehicleTrip.delete({ where: { id: tripId } }).catch(() => undefined);
    }

    it('KS_MX_ARM_WITH_ENROLLMENT', async () => {
      await armMember('KS MX 2024');
    });

    it('KS_MS_ARM_WITH_ENROLLMENT', async () => {
      await armMember('KS MS 661');
    });

    it('WOB_ARM_WITH_ENROLLMENT', async () => {
      await armMember('WOB L 7503');
    });

    it('MISSING_ENROLLMENT_FAILS_CLOSED', async () => {
      const member = cohortMembers.find((m) => m.label === 'WOB L 7503')!;
      const wobEnrollment = await prisma.exp021StudyEnrollment.findFirst({
        where: { studyId, vehicleId: member.vehicleId },
      });
      expect(wobEnrollment).toBeTruthy();
      await prisma.exp021StudyRun.deleteMany({ where: { enrollmentId: wobEnrollment!.id } });
      await prisma.exp021StudyEnrollment.delete({ where: { id: wobEnrollment!.id } });
      const tripId = randomUUID();
      await prisma.vehicleTrip.create({
        data: {
          id: tripId,
          vehicleId: member.vehicleId,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(T0_MS + 120_000),
        },
      });
      const service = createArmService(prisma, fleetRepo);
      const trip = {
        tripId,
        vehicleId: member.vehicleId,
        organizationId: member.organizationId,
        tokenId: member.tokenId,
        tripStatus: 'ONGOING' as const,
        startTimeMs: T0_MS + 120_000,
        endTimeMs: null,
      };
      const arm = (service as unknown as {
        armOngoingTrip: (t: typeof trip, ms: number, c: typeof cohort) => Promise<unknown>;
      }).armOngoingTrip.bind(service);
      await expect(arm(trip, T0_MS, cohort)).rejects.toThrow('Canary enrollment not found');
      const ledger = await prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
        where: { vehicleTripId: tripId },
      });
      expect(ledger?.state).toBe(Exp021CanaryLiveWindowActivationState.FAILED);
      expect(ledger?.failureReason).toBe('enrollment_not_found');
      await prisma.exp021CanaryLiveWindowActivationLedger.delete({ where: { vehicleTripId: tripId } });
      await prisma.vehicleTrip.delete({ where: { id: tripId } });
      await fleetRepo.createEnrollment({
        studyId,
        organizationId: member.organizationId,
        vehicleId: member.vehicleId,
        enrolledTokenId: member.tokenId,
        allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
      });
    });
  },
);
