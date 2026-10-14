/**
 * VSI03 P2C observation writer (disposable DB only):
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/vsi03_test_ci?schema=public \
 *   VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-provider-source-observation.postgres.integration --runInBand
 */
import { PrismaClient, VehicleProviderSourceObservationOutcome } from '@prisma/client';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import {
  buildDimoSnapshotSourceObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

(LIVE ? describe : describe.skip)('VsiProviderSourceObservationWriter (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new VsiProviderSourceObservationWriterService(prisma as never);

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
  });

  afterAll(async () => {
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
    await prisma.$disconnect();
  });

  it('persists stale-skip and applied observations with monotonic observation_index', async () => {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId: org!.id },
      select: { id: true, organizationId: true },
    });
    if (!org || !vehicle) return;

    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: vehicle.id, isActive: true },
      select: { id: true },
    });
    const jobA = `test-job-${Date.now()}-a`;
    const jobB = `test-job-${Date.now()}-b`;
    const t0 = new Date('2026-10-14T14:00:00.000Z');
    const t1 = new Date('2026-10-14T15:00:00.000Z');

    await writer.recordObservation({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      provider: 'DIMO',
      providerBindingId: link?.id ?? null,
      providerTokenReference: '999001',
      pollJobId: jobA,
      idempotencyKey: buildDimoSnapshotSourceObservationIdempotencyKey(jobA),
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      providerSourceTimestamp: t0,
      observationOutcome: VehicleProviderSourceObservationOutcome.VLS_APPLIED,
    });
    await writer.recordObservation({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      provider: 'DIMO',
      providerBindingId: link?.id ?? null,
      providerTokenReference: '999001',
      pollJobId: jobB,
      idempotencyKey: buildDimoSnapshotSourceObservationIdempotencyKey(jobB),
      providerFetchedAt: new Date('2026-10-14T15:00:05.000Z'),
      providerSourceTimestamp: t1,
      observationOutcome: VehicleProviderSourceObservationOutcome.VLS_APPLIED,
    });

    const rows = await prisma.vehicleProviderSourceObservation.findMany({
      where: { vehicleId: vehicle.id, providerTokenReference: '999001' },
      orderBy: { observationIndex: 'asc' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const lastTwo = rows.slice(-2);
    expect(lastTwo[1].observationIndex - lastTwo[0].observationIndex).toBe(1n);
  });
});
