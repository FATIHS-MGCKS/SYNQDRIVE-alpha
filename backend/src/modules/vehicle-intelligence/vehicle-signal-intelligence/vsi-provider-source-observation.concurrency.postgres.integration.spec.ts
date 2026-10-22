/**
 * Additional PostgreSQL concurrency stress (same disposable guard as certification suite).
 *   bash scripts/test/vsi03-p2c-postgres-ci.sh
 */
import { PrismaClient } from '@prisma/client';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { buildProviderSourceObservationScope } from './vsi-provider-source-observation.scope';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import {
  cleanupVsiP2cObservationFixture,
  createVsiP2cObservationFixture,
} from './vsi-p2c-postgres.fixture';
import {
  applyVsi03P2cCapturePilotEnv,
  clearVsi03P2cCapturePilotEnv,
} from './vsi03-p2c-capture-test-env';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

(LIVE ? describe : describe.skip)(
  'VsiProviderSourceObservationWriter concurrency stress (PostgreSQL)',
  () => {
    const prisma = new PrismaClient();
    const writer = new VsiProviderSourceObservationWriterService(prisma as never);
    const repo = new VsiProviderSourceObservationRepository(prisma as never);
    const orgIds: string[] = [];

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterEach(async () => {
      while (orgIds.length > 0) {
        const orgId = orgIds.pop();
        if (orgId) {
          await cleanupVsiP2cObservationFixture(prisma, orgId);
        }
      }
    });

    afterAll(async () => {
      clearVsi03P2cCapturePilotEnv();
      await prisma.$disconnect();
    });

    it('parallel recordProviderFetch on disposable fixture scope', async () => {
      const f = await createVsiP2cObservationFixture(prisma);
      orgIds.push(f.organizationId);
      applyVsi03P2cCapturePilotEnv({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
      });

      const results = await Promise.all(
        [0, 1, 2, 3].map((attempt) => {
          const fetchCorrelationId = `corr-${attempt}-${Date.now()}`;
          return writer.recordProviderFetch({
            organizationId: f.organizationId,
            vehicleId: f.vehicleId,
            provider: 'DIMO',
            providerBindingId: f.linkId,
            providerTokenReference: f.providerTokenReference,
            pollJobId: `job-conc-${attempt}-${Date.now()}`,
            bullmqAttemptNumber: attempt,
            fetchCorrelationId,
            idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey(fetchCorrelationId),
            providerFetchedAt: new Date(),
            providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
            monotonicStaleSkipped: false,
          });
        }),
      );

      const indices = results.map((r) => r?.observationIndex).filter(Boolean) as bigint[];
      expect(indices.length).toBe(4);
      expect(new Set(indices.map(String)).size).toBe(4);

      const scope = buildProviderSourceObservationScope({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingId: f.linkId,
        providerTokenReference: f.providerTokenReference,
      });
      const counter = await prisma.vehicleProviderSourceObservationCounter.findUnique({
        where: {
          organizationId_vehicleId_provider_providerBindingScopeKey_providerTokenScopeKey: {
            organizationId: scope.organizationId,
            vehicleId: scope.vehicleId,
            provider: scope.provider,
            providerBindingScopeKey: scope.providerBindingScopeKey,
            providerTokenScopeKey: scope.providerTokenScopeKey,
          },
        },
      });
      expect(counter?.nextObservationIndex).toBe(5n);
    });

    it('allocated gap without row fails continuity blockers', async () => {
      const f = await createVsiP2cObservationFixture(prisma);
      orgIds.push(f.organizationId);
      const scopeKey = `link-gap-${Date.now()}`;
      const token = `gap-${Date.now()}`;
      const scope = buildProviderSourceObservationScope({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingId: scopeKey,
        providerTokenReference: token,
      });

      const i1 = await writer.allocateObservationIndex(scope);
      await prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: f.organizationId,
          vehicleId: f.vehicleId,
          provider: 'DIMO',
          providerBindingId: scopeKey,
          providerBindingScopeKey: scopeKey,
          providerTokenReference: token,
          providerTokenScopeKey: token,
          pollJobId: 'gap-1',
          bullmqAttemptNumber: 0,
          fetchCorrelationId: 'gap-c1',
          recordPhase: 'PROVIDER_FETCH',
          idempotencyKey: `gap-row-1-${Date.now()}`,
          observationIndex: i1,
          providerFetchedAt: new Date('2026-10-14T11:00:00.000Z'),
          providerSourceTimestamp: new Date('2026-10-14T10:00:00.000Z'),
          sourceTimestampProvenance: 'PROVIDER_LAST_SEEN',
          observationOutcome: 'PROVIDER_FETCH_RECORDED',
        },
      });
      await writer.allocateObservationIndex(scope);
      const i3 = await writer.allocateObservationIndex(scope);
      await prisma.vehicleProviderSourceObservation.create({
        data: {
          organizationId: f.organizationId,
          vehicleId: f.vehicleId,
          provider: 'DIMO',
          providerBindingId: scopeKey,
          providerBindingScopeKey: scopeKey,
          providerTokenReference: token,
          providerTokenScopeKey: token,
          pollJobId: 'gap-3',
          bullmqAttemptNumber: 0,
          fetchCorrelationId: 'gap-c3',
          recordPhase: 'PROVIDER_FETCH',
          idempotencyKey: `gap-row-3-${Date.now()}`,
          observationIndex: i3,
          providerFetchedAt: new Date('2026-10-14T13:00:00.000Z'),
          providerSourceTimestamp: new Date('2026-10-14T12:00:00.000Z'),
          sourceTimestampProvenance: 'PROVIDER_LAST_SEEN',
          observationOutcome: 'PROVIDER_FETCH_RECORDED',
        },
      });
      await writer.allocateObservationIndex(scope);

      const continuity = await repo.loadFetchObservationContinuity({
        organizationId: f.organizationId,
        vehicleId: f.vehicleId,
        provider: 'DIMO',
        providerBindingScopeKey: scopeKey,
        providerTokenScopeKey: token,
      });
      expect(continuity.continuityBlockers).toContain('COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION');
    });
  },
);
