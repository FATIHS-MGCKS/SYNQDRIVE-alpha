/**
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
 * Operational refresh concurrency (disposable PostgreSQL).
 */
import { Prisma, PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { fingerprintVsiProfileSemanticEvaluation } from './vsi-profile-fingerprint.util';
import {
  buildOperationalProfileRefreshCasWhere,
  buildOperationalProfileRefreshUpdate,
} from './vsi-profile-operational-refresh.util';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-pg-concurrency' },
  syntheticDevice: null,
};

type OperationalRefreshPrivate = {
  persistOperationalRefreshWithConcurrencyRetry: (
    evaluation: VsiProfileEvaluationResult,
    profileId: string,
    semanticFingerprint: string,
  ) => Promise<void>;
};

async function upsertVlsForTest(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
    lvBatteryVoltage?: number | null;
    rawPayloadJson: object;
  },
): Promise<void> {
  const id = randomUUID();
  const raw = JSON.stringify(input.rawPayloadJson);
  await prisma.$executeRaw`
    INSERT INTO vehicle_latest_states (
      id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
      provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
    ) VALUES (
      ${id}::uuid,
      ${input.vehicleId},
      true,
      ${input.lvBatteryVoltage ?? null},
      null,
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function seedDrivingCapability(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  await prisma.vehicleDrivingCapability.create({
    data: {
      organizationId,
      vehicleId,
      hardwareProfile: 'LTE_R1',
      providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      signalName: 'lowVoltageBatteryCurrentVoltage',
      capabilityKey: 'lowVoltageBatteryCurrentVoltage',
      capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      checkedAt: new Date(),
      capabilityVersion: 'test',
      metadata: { listedInAvailableSignals: true },
    },
  });
}

(LIVE ? describe : describe.skip)(
  'VSI operational refresh concurrency (PostgreSQL)',
  () => {
    const prisma = new PrismaClient();
    const declared = new VsiDeclaredCatalogResolver(prisma as never);
    const service = new VsiSignalProfileMaterializationService(prisma as never, declared, createNoopVsiProfileCadenceEvidenceLoader());
    const callOperationalRefresh = (
      evaluation: VsiProfileEvaluationResult,
      profileId: string,
      semanticFingerprint: string,
    ) =>
      (service as unknown as OperationalRefreshPrivate).persistOperationalRefreshWithConcurrencyRetry(
        evaluation,
        profileId,
        semanticFingerprint,
      );

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('does not let a stale operational evaluation overwrite a newer semantic revision', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

      const sourceTs = new Date('2026-10-15T12:00:00Z');
      const fetch1 = new Date('2026-10-15T12:00:01Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: fetch1,
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });

      const staleEval = await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });
      expect(staleEval).not.toBeNull();

      const sourceTs2 = new Date('2026-10-15T13:00:00Z');
      const fetch2 = new Date('2026-10-15T13:00:01Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs2,
        providerFetchedAt: fetch2,
        lvBatteryVoltage: 13.1,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 13.1, timestamp: sourceTs2.toISOString() },
        },
      });
      await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });

      const rowBeforeStale = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(rowBeforeStale?.profileRevision).toBe(2);

      await callOperationalRefresh(
        staleEval!,
        rowBeforeStale!.id,
        fingerprintVsiProfileSemanticEvaluation(staleEval!),
      );

      const rowAfterStale = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(rowAfterStale?.profileRevision).toBe(2);
      const lv = (rowAfterStale?.signalsSnapshot as { canonicalSignalKey: string; lastValidObservationAt: string }[]).find(
        (s) => s.canonicalSignalKey === 'lv_voltage',
      );
      expect(lv?.lastValidObservationAt).toBe(sourceTs2.toISOString());
      expect(rowAfterStale?.lastMaterializedProviderFetchAt?.toISOString()).toBe(fetch2.toISOString());

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('keeps fetch timestamps monotonic under out-of-order operational evaluation', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

      const sourceTs = new Date('2026-10-15T12:00:00Z');
      const newerFetch = new Date('2026-10-15T14:00:00Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: newerFetch,
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });
      await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });

      const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: new Date('2026-10-15T12:00:01Z'),
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });
      const staleOlder = await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });
      expect(staleOlder).not.toBeNull();

      await callOperationalRefresh(
        staleOlder!,
        row!.id,
        fingerprintVsiProfileSemanticEvaluation(staleOlder!),
      );

      const rowAfter = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: { id: row!.id },
      });
      expect(rowAfter?.lastMaterializedProviderFetchAt?.toISOString()).toBe(newerFetch.toISOString());
      expect(rowAfter?.profileRevision).toBe(1);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    /**
     * Reproduces Fable lost-update (pre-CAS: both writers succeed, older fetch wins).
     * With `buildOperationalProfileRefreshCasWhere`, the stale writer loses CAS and retries/noops.
     */
    it('parallel operational writers keep the newer provider fetch (interleaved transactions)', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

      const sourceTs = new Date('2026-10-15T10:00:00.000Z');
      const fetch0 = new Date('2026-10-15T10:00:01.000Z');
      const fetchNewer = new Date('2026-10-15T10:05:00.000Z');
      const fetchOlder = new Date('2026-10-15T10:03:00.000Z');

      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: fetch0,
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });
      const baseline = await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });
      expect(baseline).not.toBeNull();
      const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(row?.profileRevision).toBe(1);

      const fp = fingerprintVsiProfileSemanticEvaluation(baseline!);
      const buildEval = (fetch: Date): VsiProfileEvaluationResult =>
        ({
          ...baseline!,
          evaluatedAt: fetch,
          lastMaterializedProviderFetchAt: fetch,
          signals: baseline!.signals.map((s) => ({
            ...s,
            lastProviderFetchAt: fetch.toISOString(),
          })),
        }) as VsiProfileEvaluationResult;
      const evalNewer = buildEval(fetchNewer);
      const evalOlder = buildEval(fetchOlder);

      const casWriter = async (evaluation: VsiProfileEvaluationResult, holdMs: number) =>
        prisma.$transaction(
          async (tx) => {
            const existing = await tx.vehicleSignalCapabilityProfile.findUnique({
              where: { id: row!.id },
            });
            const refreshData = buildOperationalProfileRefreshUpdate({
              persisted: existing!,
              evaluation,
              semanticFingerprint: fp,
            });
            if (!refreshData) {
              return { count: 0, skipped: true };
            }
            await sleep(holdMs);
            const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
              where: buildOperationalProfileRefreshCasWhere(existing!),
              data: {
                contentFingerprint: refreshData.contentFingerprint,
                evaluatedAt: refreshData.evaluatedAt,
                lastMaterializedProviderFetchAt: refreshData.lastMaterializedProviderFetchAt,
                signalsSnapshot: refreshData.signalsSnapshot as unknown as Prisma.InputJsonValue,
              },
            });
            return { count: updated.count, skipped: false };
          },
          { timeout: 30_000 },
        );

      const [newerResult, olderResult] = await Promise.all([
        casWriter(evalNewer!, 200),
        casWriter(evalOlder!, 1_200),
      ]);
      expect(newerResult.count).toBe(1);
      expect(olderResult.count).toBe(0);

      const after = await prisma.vehicleSignalCapabilityProfile.findUnique({ where: { id: row!.id } });
      expect(after?.profileRevision).toBe(1);
      expect(after?.lastMaterializedProviderFetchAt?.toISOString()).toBe(fetchNewer.toISOString());
      const lv = (after?.signalsSnapshot as { canonicalSignalKey: string; lastProviderFetchAt: string }[]).find(
        (s) => s.canonicalSignalKey === 'lv_voltage',
      );
      expect(lv?.lastProviderFetchAt).toBe(fetchNewer.toISOString());

      const historyCount = await prisma.vehicleSignalCapabilityProfileRevision.count({
        where: { organizationId, vehicleId: fixture.vehicleId, providerSourceLinkId: fixture.linkId },
      });
      expect(historyCount).toBe(0);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('persistOperationalRefreshWithConcurrencyRetry converges under parallel fetch-only writers', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

      const sourceTs = new Date('2026-10-15T11:00:00.000Z');
      const fetch0 = new Date('2026-10-15T11:00:01.000Z');
      const fetchA = new Date('2026-10-15T11:05:00.000Z');
      const fetchB = new Date('2026-10-15T11:03:00.000Z');

      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: fetch0,
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });
      const baseline = await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });
      const row = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
        where: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      });
      const fp = fingerprintVsiProfileSemanticEvaluation(baseline!);

      const buildEval = (fetch: Date): VsiProfileEvaluationResult =>
        ({
          ...baseline!,
          evaluatedAt: fetch,
          lastMaterializedProviderFetchAt: fetch,
          signals: baseline!.signals.map((s) => ({
            ...s,
            lastProviderFetchAt: fetch.toISOString(),
          })),
        }) as VsiProfileEvaluationResult;

      await Promise.all([
        callOperationalRefresh(buildEval(fetchA), row.id, fp),
        callOperationalRefresh(buildEval(fetchB), row.id, fp),
      ]);

      const after = await prisma.vehicleSignalCapabilityProfile.findUnique({ where: { id: row.id } });
      expect(after?.profileRevision).toBe(1);
      expect(after?.lastMaterializedProviderFetchAt?.toISOString()).toBe(fetchA.toISOString());

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('repeated identical fetch-only refresh is a no-op', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
      const sourceTs = new Date('2026-10-15T12:00:00.000Z');
      const fetch = new Date('2026-10-15T12:00:01.000Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: fetch,
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        },
      });
      const first = await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });
      const row = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
        where: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      });
      const fp = fingerprintVsiProfileSemanticEvaluation(first!);
      await callOperationalRefresh(first!, row.id, fp);
      await callOperationalRefresh(first!, row.id, fp);
      const after = await prisma.vehicleSignalCapabilityProfile.findUnique({ where: { id: row.id } });
      expect(after?.updatedAt.toISOString()).toBe(row.updatedAt.toISOString());

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });
  },
);
