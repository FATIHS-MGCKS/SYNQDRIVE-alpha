/**
 * PostgreSQL integration — EXP-021 three-vehicle cohort study enrollment bootstrap.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { Exp021StudyStatus, PrismaClient } from '@prisma/client';
import {
  buildExp021CanaryCohortAuthority,
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
} from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { EXP021_KS_MX_2024_CANARY } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  bootstrapExp021CohortStudyEnrollments,
  Exp021CohortStudyEnrollmentBootstrapError,
} from './reference-capture-exp021-cohort-study-enrollment-bootstrap.lib';
import { ReferenceCaptureExp021FleetRepository } from './reference-capture-exp021-fleet.repository';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';

const KS_MX = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
const KS_MS = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[1];
const WOB = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[2];

async function ensureCohortVehicleGraph(prisma: PrismaClient): Promise<void> {
  const organizationId = EXP021_KS_MX_2024_CANARY.organizationId;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Cohort Enroll Org'}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  for (const member of EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE) {
    const vin = `EXP021EN${member.tokenId}`.padEnd(17, '0').slice(0, 17);
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
    const externalId = `exp021-enroll-pg-${member.tokenId}`;
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

async function countEnrollmentsForVehicle(
  prisma: PrismaClient,
  studyId: string,
  vehicleId: string,
): Promise<number> {
  return prisma.exp021StudyEnrollment.count({
    where: { studyId, vehicleId },
  });
}

(LIVE ? describe : describe.skip)(
  'EXP-021 cohort study enrollment bootstrap PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let fleetRepo: ReferenceCaptureExp021FleetRepository;
    let studyId: string;
    let studyKey: string;
    const cohort = buildExp021CanaryCohortAuthority([...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE])!;

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        if (REQUIRED) throw new Error('REFERENCE_CAPTURE_POSTGRES_REQUIRED but DB unavailable');
        throw new Error('Postgres integration DB unavailable');
      }
      prisma = new PrismaClient();
      fleetRepo = new ReferenceCaptureExp021FleetRepository(prisma as never);
      await ensureCohortVehicleGraph(prisma);
      studyKey = `exp021-cohort-enroll-${randomUUID()}`;
      const study = await fleetRepo.createStudy({
        studyKey,
        dryRun: true,
        status: Exp021StudyStatus.COLLECTING,
      });
      studyId = study.id;

      await fleetRepo.createEnrollment({
        studyId,
        organizationId: KS_MX.organizationId,
        vehicleId: KS_MX.vehicleId,
        enrolledTokenId: KS_MX.tokenId,
        allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
      });
    }, 120_000);

    afterAll(async () => {
      if (!prisma || !studyId) return;
      await prisma.exp021StudyRun.deleteMany({ where: { studyId } });
      await prisma.exp021StudyEnrollment.deleteMany({ where: { studyId } });
      await prisma.exp021Study.delete({ where: { id: studyId } }).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    });

    it('bootstrap #1 creates B and C while preserving A; bootstrap #2 is idempotent', async () => {
      expect(await countEnrollmentsForVehicle(prisma, studyId, KS_MX.vehicleId)).toBe(1);
      expect(await countEnrollmentsForVehicle(prisma, studyId, KS_MS.vehicleId)).toBe(0);
      expect(await countEnrollmentsForVehicle(prisma, studyId, WOB.vehicleId)).toBe(0);

      const run1 = await bootstrapExp021CohortStudyEnrollments({
        prisma: prisma as never,
        fleetRepository: fleetRepo,
        cohort,
        studyKey,
        execute: true,
        enrolledBy: 'postgres-integration',
      });
      expect(run1.members.find((m) => m.vehicleId === KS_MX.vehicleId)?.action).toBe('preserved');
      expect(run1.members.find((m) => m.vehicleId === KS_MS.vehicleId)?.action).toBe('created');
      expect(run1.members.find((m) => m.vehicleId === WOB.vehicleId)?.action).toBe('created');

      expect(await countEnrollmentsForVehicle(prisma, studyId, KS_MX.vehicleId)).toBe(1);
      expect(await countEnrollmentsForVehicle(prisma, studyId, KS_MS.vehicleId)).toBe(1);
      expect(await countEnrollmentsForVehicle(prisma, studyId, WOB.vehicleId)).toBe(1);

      const runsAfterBootstrap = await prisma.exp021StudyRun.count({ where: { studyId } });
      const familiesAfterBootstrap = await prisma.exp021MaturationShadowWindowFamily.count({
        where: { vehicleId: { in: cohort.members.map((m) => m.vehicleId) } },
      });
      expect(runsAfterBootstrap).toBe(0);
      expect(familiesAfterBootstrap).toBe(0);

      const run2 = await bootstrapExp021CohortStudyEnrollments({
        prisma: prisma as never,
        fleetRepository: fleetRepo,
        cohort,
        studyKey,
        execute: true,
      });
      expect(run2.members.every((m) => m.action === 'preserved')).toBe(true);

      const total = await prisma.exp021StudyEnrollment.count({ where: { studyId } });
      expect(total).toBe(3);
    });

    it('rejects wrong vehicle/token binding and wrong organization', async () => {
      const badTokenCohort = buildExp021CanaryCohortAuthority([
        { ...KS_MS, tokenId: KS_MS.tokenId + 1 },
      ])!;
      await expect(
        bootstrapExp021CohortStudyEnrollments({
          prisma: prisma as never,
          fleetRepository: fleetRepo,
          cohort: badTokenCohort,
          studyKey,
          execute: false,
        }),
      ).rejects.toMatchObject({ code: 'VEHICLE_TOKEN_BINDING_MISMATCH' });

      const wrongOrg = randomUUID();
      const wrongOrgCohort = buildExp021CanaryCohortAuthority([
        { ...WOB, organizationId: wrongOrg },
      ])!;
      await expect(
        bootstrapExp021CohortStudyEnrollments({
          prisma: prisma as never,
          fleetRepository: fleetRepo,
          cohort: wrongOrgCohort,
          studyKey,
          execute: false,
        }),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_BINDING_MISMATCH' });
    });

    it('concurrent bootstrap converges without duplicate enrollments', async () => {
      const extraKey = `exp021-cohort-enroll-conc-${randomUUID()}`;
      const extraStudy = await fleetRepo.createStudy({
        studyKey: extraKey,
        dryRun: true,
        status: Exp021StudyStatus.COLLECTING,
      });
      await fleetRepo.createEnrollment({
        studyId: extraStudy.id,
        organizationId: KS_MX.organizationId,
        vehicleId: KS_MX.vehicleId,
        enrolledTokenId: KS_MX.tokenId,
        allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
      });

      await Promise.all(
        Array.from({ length: 4 }, () =>
          bootstrapExp021CohortStudyEnrollments({
            prisma: prisma as never,
            fleetRepository: fleetRepo,
            cohort,
            studyKey: extraKey,
            execute: true,
          }),
        ),
      );

      for (const member of EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE) {
        expect(await countEnrollmentsForVehicle(prisma, extraStudy.id, member.vehicleId)).toBe(1);
      }

      await prisma.exp021StudyEnrollment.deleteMany({ where: { studyId: extraStudy.id } });
      await prisma.exp021Study.delete({ where: { id: extraStudy.id } });
    });

    it('fails closed when study is missing', async () => {
      await expect(
        bootstrapExp021CohortStudyEnrollments({
          prisma: prisma as never,
          fleetRepository: fleetRepo,
          cohort,
          studyKey: `missing-${randomUUID()}`,
          execute: true,
        }),
      ).rejects.toBeInstanceOf(Exp021CohortStudyEnrollmentBootstrapError);
    });
  },
);
