/**
 * VSI03 P2C observation writer (disposable DB only):
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/vsi03_test_ci?schema=public \
 *   VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-provider-source-observation.postgres.integration --runInBand
 */
import { PrismaClient } from '@prisma/client';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  buildDimoSnapshotVlsApplicationIdempotencyKey,
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

  it('records fetch then VLS application for same correlation', async () => {
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
    const correlation = `corr-${Date.now()}`;
    const job = `test-job-${Date.now()}`;

    const fetch = await writer.recordProviderFetch({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      provider: 'DIMO',
      providerBindingId: link?.id ?? null,
      providerTokenReference: '999001',
      pollJobId: job,
      bullmqAttemptNumber: 0,
      fetchCorrelationId: correlation,
      idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(job, 0),
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      monotonicStaleSkipped: false,
    });
    expect(fetch?.observationIndex).toBeDefined();

    await writer.recordVlsApplication({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      provider: 'DIMO',
      providerBindingId: link?.id ?? null,
      providerTokenReference: '999001',
      pollJobId: job,
      fetchCorrelationId: correlation,
      observationIndex: fetch!.observationIndex,
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      idempotencyKey: buildDimoSnapshotVlsApplicationIdempotencyKey(correlation),
    });

    const phases = await prisma.vehicleProviderSourceObservation.findMany({
      where: { fetchCorrelationId: correlation },
      orderBy: { recordPhase: 'asc' },
    });
    expect(phases.map((p) => p.recordPhase)).toEqual(['PROVIDER_FETCH', 'VLS_APPLICATION']);
  });
});
