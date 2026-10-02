/**
 * PostgreSQL integration — EXP-021 fleet study registry (PR-C).
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { Exp021StudyRunState, Prisma, PrismaClient } from '@prisma/client';
import {
  Exp021FleetRunIdentityError,
  ReferenceCaptureExp021FleetRepository,
} from './reference-capture-exp021-fleet.repository';
import { phaseOrderKey } from './reference-capture-exp021-fleet-order-allocator.lib';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

async function seedOrgVehicle(prisma: PrismaClient): Promise<{ organizationId: string; vehicleId: string }> {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const vin = `RC${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 PRC Test Org'}, 'FLEET', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at)
    VALUES (${vehicleId}, ${organizationId}, ${vin}, 'Test', 'EXP021', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW())
  `;
  return { organizationId, vehicleId };
}

async function cleanupOrgVehicle(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
  await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
}

(LIVE ? describe : describe.skip)('EXP-021 fleet study registry PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: ReferenceCaptureExp021FleetRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
    proveIsolatedReferenceCapturePostgres();
    const ok = await probeReferenceCapturePostgresDatabase();
    if (!ok) throw new Error('REFERENCE_CAPTURE_POSTGRES_INTEGRATION requires isolated Postgres');
    prisma = new PrismaClient();
    repository = new ReferenceCaptureExp021FleetRepository(prisma as never);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('creates study and enforces enrollment unique constraint', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-prc-${randomUUID()}`, dryRun: true });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);

    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999001,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });
    expect(enrollment.enabled).toBe(true);

    await expect(
      repository.createEnrollment({
        studyId: study.id,
        organizationId,
        vehicleId,
        enrolledTokenId: 999001,
        allowedPlans: ['CANDIDATE_SHORT_AB_60_90'],
      }),
    ).rejects.toThrow();

    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });

  it('reserveStudyRunForCanaryActivation is idempotent per vehicle trip', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-canary-idem-${randomUUID()}`, dryRun: false });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const tripId = randomUUID();

    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999003,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });

    const balanceBefore = await prisma.exp021StudyOrderBalance.count({ where: { studyId: study.id } });

    const first = await repository.reserveStudyRunForCanaryActivation({
      enrollmentId: enrollment.id,
      resolvedTokenId: 999003,
      canaryActivationVehicleTripId: tripId,
    });
    const second = await repository.reserveStudyRunForCanaryActivation({
      enrollmentId: enrollment.id,
      resolvedTokenId: 999003,
      canaryActivationVehicleTripId: tripId,
    });

    expect(second.run.id).toBe(first.run.id);
    expect(second.adoptedExisting).toBe(true);
    const balanceAfter = await prisma.exp021StudyOrderBalance.count({ where: { studyId: study.id } });
    expect(balanceAfter).toBe(balanceBefore + 1);

    await prisma.exp021StudyRun.delete({ where: { id: first.run.id } });
    await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });

  it('reserveStudyRunAssignment derives run identity from enrollment authority', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-run-${randomUUID()}`, dryRun: true });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);

    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999002,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
    });

    const { run, proposed } = await repository.reserveStudyRunAssignment({
      enrollmentId: enrollment.id,
      resolvedTokenId: 999002,
    });

    expect(run.state).toBe(Exp021StudyRunState.PLANNED);
    expect(run.studyId).toBe(study.id);
    expect(run.enrollmentId).toBe(enrollment.id);
    expect(run.organizationId).toBe(organizationId);
    expect(run.vehicleId).toBe(vehicleId);
    expect(run.tokenId).toBe(999002);
    expect(proposed.phaseOrderMs.length).toBe(2);

    await prisma.exp021StudyRun.delete({ where: { id: run.id } });
    await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });

  it('fails closed on token mismatch during assignment reservation', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-token-${randomUUID()}`, dryRun: true });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999003,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });

    await expect(
      repository.reserveStudyRunAssignment({
        enrollmentId: enrollment.id,
        resolvedTokenId: 111111,
      }),
    ).rejects.toThrow(Exp021FleetRunIdentityError);

    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });

  it('fails closed on disabled enrollment during assignment reservation', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-disabled-${randomUUID()}`, dryRun: true });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999004,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });
    await repository.setEnrollmentEnabled(enrollment.id, false);

    await expect(
      repository.reserveStudyRunAssignment({
        enrollmentId: enrollment.id,
        resolvedTokenId: 999004,
      }),
    ).rejects.toThrow(Exp021FleetRunIdentityError);

    await repository.setEnrollmentEnabled(enrollment.id, true);
    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });

  it('prevents concurrent assignment double-choice via atomic reservation', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-conc-${randomUUID()}`, dryRun: true });
    const orgA = await seedOrgVehicle(prisma);
    const orgB = await seedOrgVehicle(prisma);

    const enrollmentA = await repository.createEnrollment({
      studyId: study.id,
      organizationId: orgA.organizationId,
      vehicleId: orgA.vehicleId,
      enrolledTokenId: 999101,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
    });
    const enrollmentB = await repository.createEnrollment({
      studyId: study.id,
      organizationId: orgB.organizationId,
      vehicleId: orgB.vehicleId,
      enrolledTokenId: 999102,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60', 'CANDIDATE_SHORT_AB_60_90'],
    });

    const [resultA, resultB] = await Promise.all([
      repository.reserveStudyRunAssignment({ enrollmentId: enrollmentA.id, resolvedTokenId: 999101 }),
      repository.reserveStudyRunAssignment({ enrollmentId: enrollmentB.id, resolvedTokenId: 999102 }),
    ]);

    const keys = new Set([
      phaseOrderKey(resultA.proposed.phaseOrderMs),
      phaseOrderKey(resultB.proposed.phaseOrderMs),
    ]);
    expect(keys.size).toBe(2);

    const globalBalances = await prisma.exp021StudyOrderBalance.findMany({ where: { studyId: study.id } });
    const totalCommitted = globalBalances.reduce((sum, row) => sum + row.committedCount, 0);
    expect(totalCommitted).toBe(2);

    await prisma.exp021StudyRun.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyEnrollment.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, orgA.organizationId, orgA.vehicleId);
    await cleanupOrgVehicle(prisma, orgB.organizationId, orgB.vehicleId);
  });

  it('RESTRICT retention prevents deleting enrollment or study while runs exist', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-retain-${randomUUID()}`, dryRun: true });
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999005,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });
    const { run } = await repository.reserveStudyRunAssignment({
      enrollmentId: enrollment.id,
      resolvedTokenId: 999005,
    });

    await expect(
      prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.exp021Study.delete({ where: { id: study.id } })).rejects.toMatchObject({
      code: 'P2003',
    });

    await expect(
      prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`,
    ).rejects.toThrow(/foreign key|violates foreign key constraint/i);

    await prisma.exp021StudyRun.delete({ where: { id: run.id } });
    await prisma.exp021StudyOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyVehicleOrderBalance.deleteMany({ where: { studyId: study.id } });
    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await cleanupOrgVehicle(prisma, organizationId, vehicleId);
  });
});
