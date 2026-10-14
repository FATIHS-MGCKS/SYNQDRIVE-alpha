/**
 * Real PostgreSQL concurrency tests (disposable DB only):
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/vsi03_test_ci?schema=public \
 *   VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-provider-source-observation.concurrency.postgres.integration --runInBand
 */
import {
  PrismaClient,
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
  VehicleProviderSourceTimestampProvenance,
} from '@prisma/client';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { buildProviderSourceObservationScope } from './vsi-provider-source-observation.scope';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

(LIVE ? describe : describe.skip)(
  'VsiProviderSourceObservationWriter concurrency (PostgreSQL)',
  () => {
    const prisma = new PrismaClient();
    const writer = new VsiProviderSourceObservationWriterService(prisma as never);
    const repo = new VsiProviderSourceObservationRepository(prisma as never);

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
      process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
    });

    afterAll(async () => {
      delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
      await prisma.$disconnect();
    });

    it('4 concurrent fetches receive unique observation indices', async () => {
      const org = await prisma.organization.findFirst({ select: { id: true } });
      const vehicle = await prisma.vehicle.findFirst({
        where: { organizationId: org!.id },
        select: { id: true, organizationId: true },
      });
      if (!org || !vehicle) return;

      const base = {
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        provider: 'DIMO',
        providerBindingId: 'link-concurrency-test',
        providerTokenReference: 'conc-token',
        pollJobId: 'job-conc',
        providerFetchedAt: new Date(),
        providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
        monotonicStaleSkipped: false,
      };

      const results = await Promise.all(
        [0, 1, 2, 3].map((attempt) =>
          writer.recordProviderFetch({
            ...base,
            bullmqAttemptNumber: attempt,
            fetchCorrelationId: `corr-${attempt}-${Date.now()}`,
            idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(
              `job-conc-${attempt}-${Date.now()}`,
              attempt,
            ),
          }),
        ),
      );

      const indices = results.map((r) => r?.observationIndex).filter(Boolean) as bigint[];
      expect(indices.length).toBe(4);
      expect(new Set(indices.map(String)).size).toBe(4);
    });

    it('1 allocated but missing persisted fetch breaks continuity', async () => {
      const org = await prisma.organization.findFirst({ select: { id: true } });
      const vehicle = await prisma.vehicle.findFirst({
        where: { organizationId: org!.id },
        select: { id: true, organizationId: true },
      });
      if (!org || !vehicle) return;

      const scopeKey = `link-gap-${Date.now()}`;
      const token = `gap-${Date.now()}`;
      const scope = buildProviderSourceObservationScope({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        provider: 'DIMO',
        providerBindingId: scopeKey,
        providerTokenReference: token,
      });

      const i1 = await writer.allocateObservationIndex(scope);
      await prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: scope.organizationId,
          vehicleId: scope.vehicleId,
          provider: scope.provider,
          providerBindingId: scopeKey,
          providerBindingScopeKey: scopeKey,
          providerTokenReference: token,
          providerTokenScopeKey: token,
          pollJobId: 'gap-1',
          bullmqAttemptNumber: 0,
          fetchCorrelationId: 'gap-c1',
          recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
          idempotencyKey: `gap-test-1-${Date.now()}`,
          observationIndex: i1,
          providerFetchedAt: new Date('2026-10-14T11:00:00.000Z'),
          providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
          sourceTimestampProvenance: VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN,
          observationOutcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
        },
      });

      await writer.allocateObservationIndex(scope);

      const i3 = await writer.allocateObservationIndex(scope);
      await prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: scope.organizationId,
          vehicleId: scope.vehicleId,
          provider: scope.provider,
          providerBindingId: scopeKey,
          providerBindingScopeKey: scopeKey,
          providerTokenReference: token,
          providerTokenScopeKey: token,
          pollJobId: 'gap-3',
          bullmqAttemptNumber: 0,
          fetchCorrelationId: 'gap-c3',
          recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
          idempotencyKey: `gap-test-3-${Date.now()}`,
          observationIndex: i3,
          providerFetchedAt: new Date('2026-10-14T13:00:00.000Z'),
          providerSourceTimestamp: new Date('2026-10-14T12:00:00.000Z'),
          sourceTimestampProvenance: VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN,
          observationOutcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
        },
      });

      const continuity = await repo.loadFetchObservationContinuity({
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
      });
      expect(continuity.continuityIntact).toBe(false);
      expect(i3 - i1).toBe(2n);
    });
  },
);
