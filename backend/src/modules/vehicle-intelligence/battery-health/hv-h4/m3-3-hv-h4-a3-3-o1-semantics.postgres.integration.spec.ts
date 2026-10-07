import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryGroundTruthVerificationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  createGtOrgVehicle,
  insertGtBatteryReplacementServiceEvent,
} from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT } from './m3-3-hv-h4.constants';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceEffectiveRevisionAmbiguityError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionMissingDurabilityAckError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import { loadM3_3HvH4DurableModeAChargeSessionsV1 } from './m3-3-hv-h4-a3-durable-charge-session-loader.v1';
import { runM3_3HvH4DurableModeAA2ReportBundleV1 } from './m3-3-hv-h4-a3-parity.harness.v1';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { applyM3_3HvH4ChargeSessionSourcePopulationV1 } from './m3-3-hv-h4-charge-session-source-population.v1';
import { runM3_3HvH4ReadOnlyTransaction } from './m3-3-hv-h4-readonly-transaction';
import {
  assertSqlPrototypeAmbiguityFailClosedV1,
  detectTsAmbiguityPerSegmentV1,
  selectModeAEffectiveRevisionIdsSqlPrototypeV1,
  sqlEffectiveIdsMatchTsV1,
} from './m3-3-hv-h4-a3-3-o1-mode-a-sql-effective-selection.v1';
import { reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
import { encodeM3_3HvH4EnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const EVAL = new Date('2026-09-01T00:00:00.000Z');
const KNOWABLE_ANCHOR = new Date('2026-05-01T10:00:00.000Z');

async function createNativeSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    id?: string;
    segmentFingerprint?: string;
    startAt?: Date;
    endAt?: Date;
    energyAddedKwh?: number;
    createdAt?: Date;
    receivedAt?: Date;
    updatedAt?: Date;
  },
) {
  const startAt = input.startAt ?? new Date('2026-05-01T08:00:00.000Z');
  const endAt = input.endAt ?? new Date('2026-05-01T10:00:00.000Z');
  return prisma.hvChargeSession.create({
    data: {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: input.segmentFingerprint ?? `fp-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt,
      endAt,
      energyAddedKwh: input.energyAddedKwh ?? 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: input.createdAt ?? KNOWABLE_ANCHOR,
      receivedAt: input.receivedAt ?? KNOWABLE_ANCHOR,
      updatedAt: input.updatedAt ?? KNOWABLE_ANCHOR,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    },
  });
}

async function insertCoherentDurableRevisionV1(
  prisma: PrismaClient,
  input: {
    projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
    ordering: { capturedAt: Date; createdAt: Date; sourceUpdatedAt?: Date };
    withAck?: boolean;
  },
) {
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(input.projection);
  const mirror = mirrorFromScientificProjectionV1(input.projection);
  const sourceUpdatedAt = input.ordering.sourceUpdatedAt ?? mirror.sourceUpdatedAt;
  const revision = await prisma.batteryHvChargeSessionEvidenceRevision.create({
    data: {
      organizationId: mirror.organizationId,
      vehicleId: mirror.vehicleId,
      sourceHvChargeSessionId: mirror.sourceHvChargeSessionId,
      segmentFingerprint: mirror.segmentFingerprint,
      evidenceContractVersion: input.projection.evidenceContractVersion,
      sourceRevisionFingerprint,
      scientificEvidenceJson: input.projection as unknown as Prisma.InputJsonValue,
      dimoSegmentId: mirror.dimoSegmentId,
      providerSegmentId: mirror.providerSegmentId,
      source: mirror.source,
      startAt: mirror.startAt,
      endAt: mirror.endAt,
      isOngoing: mirror.isOngoing,
      energyAddedKwh: mirror.energyAddedKwh,
      providerObservedAt: mirror.providerObservedAt,
      addedEnergyProvenance: mirror.addedEnergyProvenance,
      qualityStatus: mirror.qualityStatus,
      supersededBySegmentFingerprint: mirror.supersededBySegmentFingerprint,
      startedBeforeRange: mirror.startedBeforeRange,
      sourceCreatedAt: mirror.sourceCreatedAt,
      sourceReceivedAt: mirror.sourceReceivedAt,
      sourceUpdatedAt,
      capturedAt: input.ordering.capturedAt,
      createdAt: input.ordering.createdAt,
    },
  });
  if (input.withAck !== false) {
    await prisma.batteryHvChargeSessionEvidenceAck.create({
      data: {
        organizationId: revision.organizationId,
        vehicleId: revision.vehicleId,
        segmentFingerprint: revision.segmentFingerprint,
        evidenceContractVersion: revision.evidenceContractVersion,
        sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
        revisionId: revision.id,
        durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
      },
    });
  }
  return revision;
}

function projectionFromSession(
  session: Awaited<ReturnType<typeof createNativeSession>>,
  patch?: Partial<M3_3HvH4ChargeSessionEvidenceScientificProjectionV1>,
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  return { ...projection, ...patch };
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3-O1 MODE_A semantics characterization (postgres)',
  () => {
    let prisma: PrismaClient;
    let writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function expectDurableLoadFail(
      organizationId: string,
      vehicleId: string,
      errorClass: new (...args: never[]) => Error,
    ) {
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(errorClass);
    }

    it('O1-C1 non-effective corrupted revision fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c1-${randomUUID()}`;
      const session = await createNativeSession(prisma, { organizationId, vehicleId, segmentFingerprint: fp });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 99, updatedAt: new Date('2026-08-01T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      const older = await prisma.batteryHvChargeSessionEvidenceRevision.findFirst({
        where: { sourceHvChargeSessionId: session.id },
        orderBy: { createdAt: 'asc' },
      });
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: older!.id },
        data: { sourceRevisionFingerprint: '0'.repeat(64) },
      });
      await expectDurableLoadFail(
        organizationId,
        vehicleId,
        H4EvidenceRevisionStoredFingerprintMismatchError,
      );
    });

    it('O1-C2 non-effective missing ACK fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c2-${randomUUID()}`;
      const session = await createNativeSession(prisma, { organizationId, vehicleId, segmentFingerprint: fp });
      const olderAt = new Date('2026-06-01T00:00:00.000Z');
      const pOld = projectionFromSession(session, {
        sourceUpdatedAt: olderAt.toISOString(),
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: pOld,
        ordering: { capturedAt: olderAt, createdAt: olderAt, sourceUpdatedAt: olderAt },
        withAck: false,
      });
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 20, updatedAt: new Date('2026-08-01T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      await expectDurableLoadFail(
        organizationId,
        vehicleId,
        H4EvidenceRevisionMissingDurabilityAckError,
      );
    });

    it('O1-C3 non-effective ACK identity mismatch fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c3-${randomUUID()}`;
      const session = await createNativeSession(prisma, { organizationId, vehicleId, segmentFingerprint: fp });
      const olderAt = new Date('2026-06-01T00:00:00.000Z');
      const pOld = projectionFromSession(session, { sourceUpdatedAt: olderAt.toISOString() });
      const oldRev = await insertCoherentDurableRevisionV1(prisma, {
        projection: pOld,
        ordering: { capturedAt: olderAt, createdAt: olderAt, sourceUpdatedAt: olderAt },
      });
      await prisma.batteryHvChargeSessionEvidenceAck.updateMany({
        where: { revisionId: oldRev.id },
        data: { sourceRevisionFingerprint: 'f'.repeat(64) },
      });
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date('2026-08-01T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      await expectDurableLoadFail(organizationId, vehicleId, H4EvidenceAckIdentityMismatchError);
    });

    it('O1-C4 non-effective mirror drift fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c4-${randomUUID()}`;
      const session = await createNativeSession(prisma, { organizationId, vehicleId, segmentFingerprint: fp });
      const olderAt = new Date('2026-06-01T00:00:00.000Z');
      const pOld = projectionFromSession(session, { sourceUpdatedAt: olderAt.toISOString() });
      const oldRev = await insertCoherentDurableRevisionV1(prisma, {
        projection: pOld,
        ordering: { capturedAt: olderAt, createdAt: olderAt, sourceUpdatedAt: olderAt },
      });
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: oldRev.id },
        data: { energyAddedKwh: 999 },
      });
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date('2026-08-01T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      await expectDurableLoadFail(
        organizationId,
        vehicleId,
        H4EvidenceRevisionMirrorIncoherenceError,
      );
    });

    it('O1-C5 top ordering tuple ambiguity fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c5-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
        updatedAt: KNOWABLE_ANCHOR,
      });
      const tie = new Date('2026-07-01T00:00:00.000Z');
      const p1 = projectionFromSession(session, {
        energyAddedKwh: encodeM3_3HvH4EnergyAddedKwhV1(11),
        sourceUpdatedAt: tie.toISOString(),
        sourceCreatedAt: tie.toISOString(),
        sourceReceivedAt: tie.toISOString(),
      });
      const p2 = projectionFromSession(session, {
        energyAddedKwh: encodeM3_3HvH4EnergyAddedKwhV1(12),
        sourceUpdatedAt: tie.toISOString(),
        sourceCreatedAt: tie.toISOString(),
        sourceReceivedAt: tie.toISOString(),
      });
      expect(computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(p1)).not.toBe(
        computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(p2),
      );
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p1,
        ordering: { capturedAt: tie, createdAt: tie, sourceUpdatedAt: tie },
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p2,
        ordering: { capturedAt: tie, createdAt: tie, sourceUpdatedAt: tie },
      });
      await expectDurableLoadFail(
        organizationId,
        vehicleId,
        H4EvidenceEffectiveRevisionAmbiguityError,
      );
    });

    it('O1-C6 collapse before evaluationAt filter (no fallback to older revision)', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-o1c6-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
        endAt: new Date('2026-05-01T10:00:00.000Z'),
      });
      const olderAt = new Date('2026-06-01T00:00:00.000Z');
      const pOld = projectionFromSession(session, { sourceUpdatedAt: olderAt.toISOString() });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: pOld,
        ordering: { capturedAt: olderAt, createdAt: olderAt, sourceUpdatedAt: olderAt },
      });
      const futureStart = new Date('2026-10-01T08:00:00.000Z');
      const futureEnd = new Date('2026-10-01T10:00:00.000Z');
      const newerAt = new Date('2026-10-01T12:00:00.000Z');
      const pNew = projectionFromSession(session, {
        sourceHvChargeSessionId: randomUUID(),
        startAt: futureStart.toISOString(),
        endAt: futureEnd.toISOString(),
        sourceUpdatedAt: newerAt.toISOString(),
        sourceCreatedAt: newerAt.toISOString(),
        sourceReceivedAt: newerAt.toISOString(),
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: pNew,
        ordering: { capturedAt: newerAt, createdAt: newerAt, sourceUpdatedAt: newerAt },
      });
      const evaluationAt = new Date('2026-09-15T00:00:00.000Z');
      const bundle = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        { organizationId, vehicleId },
        evaluationAt,
      );
      expect(bundle.loadedData.chargeSessions).toHaveLength(0);
      expect(bundle.loadedData.chargeSessionSourceLoad.loadedCount).toBe(0);
    });

    it('O1-C7 effective sourceHvChargeSessionId drives A1 id ASC ordering', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp1 = `fp-o1c7a-${randomUUID()}`;
      const fp2 = `fp-o1c7b-${randomUUID()}`;
      const sharedStart = new Date('2026-05-01T08:00:00.000Z');
      const idOld = '00000000-0000-4000-8000-000000000001';
      const idEffective = '00000000-0000-4000-8000-000000000002';
      const idOther = '00000000-0000-4000-8000-000000000003';
      const sOld = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        id: idOld,
        segmentFingerprint: fp1,
        startAt: sharedStart,
      });
      const olderAt = new Date('2026-06-01T00:00:00.000Z');
      await insertCoherentDurableRevisionV1(prisma, {
        projection: projectionFromSession(sOld, { sourceUpdatedAt: olderAt.toISOString() }),
        ordering: { capturedAt: olderAt, createdAt: olderAt, sourceUpdatedAt: olderAt },
      });
      const newerAt = new Date('2026-08-01T00:00:00.000Z');
      const pEffective = projectionFromSession(sOld, {
        sourceHvChargeSessionId: idEffective,
        energyAddedKwh: encodeM3_3HvH4EnergyAddedKwhV1(14),
        sourceUpdatedAt: newerAt.toISOString(),
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: pEffective,
        ordering: { capturedAt: newerAt, createdAt: newerAt, sourceUpdatedAt: newerAt },
      });
      const sOther = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        id: idOther,
        segmentFingerprint: fp2,
        startAt: sharedStart,
      });
      await writer.persistFromHvChargeSession(sOther);
      const load = await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) =>
        loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
          organizationId,
          vehicleId,
          evaluationAt: EVAL,
        }),
      );
      expect(load.chargeSessions.map((s) => s.id)).toEqual(
        [idEffective, idOther].sort((a, b) => a.localeCompare(b)),
      );
    });

    it(
      'O1-C8 5001 effective canonical sessions truncation semantics',
      async () => {
        const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
        const n = M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT + 1;
        for (let i = 0; i < n; i += 1) {
          const session = await createNativeSession(prisma, {
            organizationId,
            vehicleId,
            startAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)),
            endAt: new Date(Date.UTC(2020, 0, 1, 1, 0, i)),
          });
          await writer.persistFromHvChargeSession(session);
        }
        const load = await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) =>
          loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
            organizationId,
            vehicleId,
            evaluationAt: new Date('2030-01-01T00:00:00.000Z'),
          }),
        );
        expect(load.chargeSessionSourceLoad.loadedCount).toBe(
          M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT,
        );
        expect(load.chargeSessionSourceLoad.sourceTruncated).toBe(true);
        expect(load.chargeSessionSourceLoad.hardLimitReached).toBe(true);
      },
      900_000,
    );

    it('O1-C9 tenant isolation by organizationId + vehicleId', async () => {
      const a = await createGtOrgVehicle(prisma);
      const b = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, {
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
      });
      await writer.persistFromHvChargeSession(session);
      const loadB = await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) =>
        loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
          organizationId: b.organizationId,
          vehicleId: b.vehicleId,
          evaluationAt: EVAL,
        }),
      );
      expect(loadB.chargeSessions).toHaveLength(0);
    });

    it('O1-C10 zero revisions returns empty population', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const load = await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) =>
        loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
          organizationId,
          vehicleId,
          evaluationAt: EVAL,
        }),
      );
      expect(load.chargeSessions).toEqual([]);
      expect(load.chargeSessionSourceLoad).toEqual({
        loadedCount: 0,
        hardLimit: M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT,
        sourceTruncated: false,
        hardLimitReached: false,
      });
    });

    it('SQL prototype effective selection parity vs TS collapse', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      for (let i = 0; i < 5; i += 1) {
        const session = await createNativeSession(prisma, { organizationId, vehicleId });
        await writer.persistFromHvChargeSession(session);
        if (i === 0) {
          const updated = await prisma.hvChargeSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date('2026-08-01T00:00:00.000Z') },
          });
          await writer.persistFromHvChargeSession(updated);
        }
      }
      const revisions = await prisma.batteryHvChargeSessionEvidenceRevision.findMany({
        where: { organizationId, vehicleId, evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 },
      });
      const sql = await selectModeAEffectiveRevisionIdsSqlPrototypeV1(prisma, {
        organizationId,
        vehicleId,
      });
      assertSqlPrototypeAmbiguityFailClosedV1(sql);
      expect(sqlEffectiveIdsMatchTsV1({ sqlIds: sql.effectiveRevisionIds, revisions })).toBe(true);
    });

    it('SQL prototype ambiguity parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-sql-amb-${randomUUID()}`;
      const session = await createNativeSession(prisma, { organizationId, vehicleId, segmentFingerprint: fp });
      const tie = new Date('2026-07-01T00:00:00.000Z');
      const p1 = projectionFromSession(session, {
        sourceUpdatedAt: tie.toISOString(),
        sourceCreatedAt: tie.toISOString(),
        sourceReceivedAt: tie.toISOString(),
      });
      const p2 = projectionFromSession(session, {
        energyAddedKwh: encodeM3_3HvH4EnergyAddedKwhV1(15),
        sourceUpdatedAt: tie.toISOString(),
        sourceCreatedAt: tie.toISOString(),
        sourceReceivedAt: tie.toISOString(),
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p1,
        ordering: { capturedAt: tie, createdAt: tie, sourceUpdatedAt: tie },
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p2,
        ordering: { capturedAt: tie, createdAt: tie, sourceUpdatedAt: tie },
      });
      const revisions = await prisma.batteryHvChargeSessionEvidenceRevision.findMany({
        where: { organizationId, vehicleId },
      });
      expect(detectTsAmbiguityPerSegmentV1(revisions)).toContain(fp);
      const sql = await selectModeAEffectiveRevisionIdsSqlPrototypeV1(prisma, {
        organizationId,
        vehicleId,
      });
      expect(sql.ambiguousSegmentFingerprints).toContain(fp);
      expect(() => assertSqlPrototypeAmbiguityFailClosedV1(sql)).toThrow(
        H4EvidenceEffectiveRevisionAmbiguityError,
      );
    });

    it('SQL-selected effective rows + population parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const s1 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
      });
      const s2 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-06-01T08:00:00.000Z'),
      });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);
      const sql = await selectModeAEffectiveRevisionIdsSqlPrototypeV1(prisma, {
        organizationId,
        vehicleId,
      });
      assertSqlPrototypeAmbiguityFailClosedV1(sql);
      const revRows = await prisma.batteryHvChargeSessionEvidenceRevision.findMany({
        where: { id: { in: sql.effectiveRevisionIds } },
      });
      const reconstructed = revRows.map((r) =>
        reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1(r),
      );
      const sqlPopulated = applyM3_3HvH4ChargeSessionSourcePopulationV1({
        sessions: reconstructed,
        evaluationAt: EVAL,
      });
      const loader = await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) =>
        loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
          organizationId,
          vehicleId,
          evaluationAt: EVAL,
        }),
      );
      expect(sqlPopulated.sessions.map((s) => s.id)).toEqual(
        loader.chargeSessions.map((s) => s.id),
      );
      expect(sqlPopulated.sourceLoad).toEqual(loader.chargeSessionSourceLoad);
    });

    it('multi-lifecycle SQL selection matches TS after replacement GT', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const replacementAt = new Date('2026-06-01T00:00:00.000Z');
      await prisma.batteryGroundTruthEvent.create({
        data: {
          organizationId,
          vehicleId,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          batteryScope: BatteryEvidenceScope.HV,
          effectiveAt: replacementAt,
          createdAt: replacementAt,
          sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          sourceContentFingerprint:
            randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32),
          sourceServiceEventId: await insertGtBatteryReplacementServiceEvent(prisma, {
            organizationId,
            vehicleId,
            eventDate: replacementAt,
          }),
        },
      });
      const pre = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
      });
      const post = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-07-05T08:00:00.000Z'),
      });
      await writer.persistFromHvChargeSession(pre);
      await writer.persistFromHvChargeSession(post);
      const revisions = await prisma.batteryHvChargeSessionEvidenceRevision.findMany({
        where: { organizationId, vehicleId },
      });
      const sql = await selectModeAEffectiveRevisionIdsSqlPrototypeV1(prisma, {
        organizationId,
        vehicleId,
      });
      assertSqlPrototypeAmbiguityFailClosedV1(sql);
      expect(sqlEffectiveIdsMatchTsV1({ sqlIds: sql.effectiveRevisionIds, revisions })).toBe(true);
    });
  },
);
