/**
 * PostgreSQL integration — EXP-021 fleet study registry (PR-C).
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { Exp021StudyRunState, PrismaClient } from '@prisma/client';
import { ReferenceCaptureExp021FleetRepository } from './reference-capture-exp021-fleet.repository';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

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
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('persists study run ledger rows', async () => {
    const study = await repository.createStudy({ studyKey: `exp021-run-${randomUUID()}` });
    const organizationId = randomUUID();
    const vehicleId = randomUUID();
    const vin = `RC${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);

    await prisma.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
      VALUES (${organizationId}, ${'EXP021 Run Org'}, 'FLEET', NOW(), NOW())
    `;
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at)
      VALUES (${vehicleId}, ${organizationId}, ${vin}, 'Test', 'EXP021', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW())
    `;

    const enrollment = await repository.createEnrollment({
      studyId: study.id,
      organizationId,
      vehicleId,
      enrolledTokenId: 999002,
      allowedPlans: ['CANDIDATE_SHORT_AB_90_60'],
    });

    const run = await repository.createStudyRun({
      studyId: study.id,
      enrollmentId: enrollment.id,
      organizationId,
      vehicleId,
      tokenId: 999002,
      assignedPhaseOrderMs: [90_000, 60_000],
      planId: 'candidate_short_ab_90_60',
      planVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
      state: Exp021StudyRunState.PLANNED,
    });
    expect(run.state).toBe(Exp021StudyRunState.PLANNED);

    await prisma.exp021StudyRun.delete({ where: { id: run.id } });
    await prisma.exp021StudyEnrollment.delete({ where: { id: enrollment.id } });
    await prisma.exp021Study.delete({ where: { id: study.id } });
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
});
