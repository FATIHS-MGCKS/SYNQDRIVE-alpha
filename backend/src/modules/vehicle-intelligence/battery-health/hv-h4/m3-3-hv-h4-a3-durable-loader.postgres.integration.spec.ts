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
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  H4EvidenceEffectiveRevisionAmbiguityError,
  H4EvidenceRevisionMissingDurabilityAckError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { encodeM3_3HvH4EnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import {
  runM3_3HvH4DurableModeAA2ReportBundleV1,
  runM3_3HvH4LiveDurableModeAParityV1,
} from './m3-3-hv-h4-a3-parity.harness.v1';
const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const EVAL = new Date('2026-09-01T00:00:00.000Z');
const REPLACEMENT_AT = new Date('2026-06-01T00:00:00.000Z');
const KNOWABLE_ANCHOR = new Date('2026-05-01T10:00:00.000Z');
const LATE_KNOWLEDGE = new Date('2026-10-01T00:00:00.000Z');

async function createNativeSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    id?: string;
    segmentFingerprint?: string;
    startAt?: Date;
    endAt?: Date;
    energyAddedKwh?: number | null;
    providerSegmentId?: string;
    createdAt?: Date;
    receivedAt?: Date;
    updatedAt?: Date;
    metadata?: Record<string, unknown>;
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
      energyAddedKwh:
        input.energyAddedKwh !== undefined ? input.energyAddedKwh : 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: input.createdAt ?? KNOWABLE_ANCHOR,
      receivedAt: input.receivedAt ?? KNOWABLE_ANCHOR,
      updatedAt: input.updatedAt ?? KNOWABLE_ANCHOR,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: input.providerSegmentId ?? `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        ...(input.metadata ?? {}),
      },
    },
  });
}

async function insertCoherentDurableRevisionV1(
  prisma: PrismaClient,
  input: {
    projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
    ordering: { capturedAt: Date; createdAt: Date };
  },
) {
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(input.projection);
  const mirror = mirrorFromScientificProjectionV1(input.projection);
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
      sourceUpdatedAt: mirror.sourceUpdatedAt,
      capturedAt: input.ordering.capturedAt,
      createdAt: input.ordering.createdAt,
    },
  });
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
  return revision;
}

function projectionWithTiedKnowledgeEnvelope(
  session: Awaited<ReturnType<typeof createNativeSession>>,
  input: {
    energyAddedKwh: number;
    tie: Date;
  },
): M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 {
  const tieIso = input.tie.toISOString();
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  projection.energyAddedKwh = encodeM3_3HvH4EnergyAddedKwhV1(input.energyAddedKwh);
  projection.sourceCreatedAt = tieIso;
  projection.sourceReceivedAt = tieIso;
  projection.sourceUpdatedAt = tieIso;
  return projection;
}

async function persistAllSessions(
  writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>,
  prisma: PrismaClient,
  sessionIds: string[],
) {
  for (const id of sessionIds) {
    const row = await prisma.hvChargeSession.findUniqueOrThrow({ where: { id } });
    await writer.persistFromHvChargeSession(row);
  }
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3 durable MODE_A loader postgres parity',
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

    it('A) LIVE === DURABLE MODE_A and raw-delete durable unchanged', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const s1 = await createNativeSession(prisma, { organizationId, vehicleId });
      const s2 = await createNativeSession(prisma, { organizationId, vehicleId });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);

      const input = { organizationId, vehicleId, evaluationAt: EVAL };
      await runM3_3HvH4LiveDurableModeAParityV1(prisma, input, EVAL);

      const durableBeforeDelete = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        input,
        EVAL,
      );
      await prisma.hvChargeSession.deleteMany({ where: { organizationId, vehicleId } });
      const durableAfterDelete = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        input,
        EVAL,
      );
      expect(durableAfterDelete.throughput).toEqual(durableBeforeDelete.throughput);
      expect(durableAfterDelete.coverage).toEqual(durableBeforeDelete.coverage);
      expect(durableAfterDelete.loadedData.chargeSessionSourceLoad).toEqual(
        durableBeforeDelete.loadedData.chargeSessionSourceLoad,
      );
    });

    it('B) LATE_CREATED_ONLY parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        createdAt: LATE_KNOWLEDGE,
        receivedAt: KNOWABLE_ANCHOR,
        updatedAt: KNOWABLE_ANCHOR,
      });
      await writer.persistFromHvChargeSession(session);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
      const cls = bundle.live.throughput.sessionClassifications[0]!;
      expect(cls.contributionEligibility).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
      expect(cls.reasonCodes).toContain('CURRENT_ROW_CREATED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_RECEIVED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_UPDATED_AFTER_EVALUATION_AT');
    });

    it('C) LATE_UPDATED_ONLY parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        createdAt: KNOWABLE_ANCHOR,
        receivedAt: KNOWABLE_ANCHOR,
        updatedAt: LATE_KNOWLEDGE,
      });
      await writer.persistFromHvChargeSession(session);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
      const cls = bundle.live.throughput.sessionClassifications[0]!;
      expect(cls.contributionEligibility).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
      expect(cls.reasonCodes).toContain('CURRENT_ROW_UPDATED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_CREATED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_RECEIVED_AFTER_EVALUATION_AT');
    });

    it('D) LATE_RECEIVED_ONLY parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        createdAt: KNOWABLE_ANCHOR,
        receivedAt: LATE_KNOWLEDGE,
        updatedAt: KNOWABLE_ANCHOR,
      });
      await writer.persistFromHvChargeSession(session);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
      const cls = bundle.live.throughput.sessionClassifications[0]!;
      expect(cls.contributionEligibility).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
      expect(cls.reasonCodes).toContain('CURRENT_ROW_RECEIVED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_CREATED_AFTER_EVALUATION_AT');
      expect(cls.reasonCodes).not.toContain('CURRENT_ROW_UPDATED_AFTER_EVALUATION_AT');
    });

    it('H) overlapping eligible native sessions parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const start = new Date('2026-05-01T08:00:00.000Z');
      const end1 = new Date('2026-05-01T12:00:00.000Z');
      const end2 = new Date('2026-05-01T14:00:00.000Z');
      const s1 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: start,
        endAt: end1,
      });
      const s2 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T10:00:00.000Z'),
        endAt: end2,
      });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.throughput.segments[0]?.compositionStatus).toBe('SOURCE_CONFLICT');
    });

    it('I) DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const sharedProvider = `provider-dup-${randomUUID()}`;
      const s1 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        providerSegmentId: sharedProvider,
        startAt: new Date('2026-07-01T08:00:00.000Z'),
        endAt: new Date('2026-07-01T10:00:00.000Z'),
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        receivedAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-01T10:00:00.000Z'),
      });
      const s2 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        providerSegmentId: sharedProvider,
        startAt: new Date('2026-07-02T08:00:00.000Z'),
        endAt: new Date('2026-07-02T10:00:00.000Z'),
        createdAt: new Date('2026-07-02T10:00:00.000Z'),
        receivedAt: new Date('2026-07-02T10:00:00.000Z'),
        updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      const seg0 = bundle.live.throughput.segments.find(
        (s) => s.lifecycleSegmentId === 'HV_SEGMENT_0',
      );
      expect(seg0?.compositionStatus).toBe('SOURCE_CONFLICT');
      expect(seg0?.reasonCodes).toContain('DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID');
      expect(seg0?.sourceFingerprint).toBe(
        bundle.durable.throughput.segments.find((s) => s.lifecycleSegmentId === 'HV_SEGMENT_0')
          ?.sourceFingerprint,
      );
    });

    it('L) late GT resegmentation parity without lifecycle source truth in durable JSON', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      await prisma.batteryGroundTruthEvent.create({
        data: {
          organizationId,
          vehicleId,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          batteryScope: BatteryEvidenceScope.HV,
          effectiveAt: REPLACEMENT_AT,
          createdAt: REPLACEMENT_AT,
          sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          sourceContentFingerprint:
            randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32),
          sourceServiceEventId: await insertGtBatteryReplacementServiceEvent(prisma, {
            organizationId,
            vehicleId,
            eventDate: REPLACEMENT_AT,
          }),
        },
      });
      const pre = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
        endAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        receivedAt: new Date('2026-05-01T10:00:00.000Z'),
        updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      });
      const post = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-07-05T08:00:00.000Z'),
        endAt: new Date('2026-07-05T10:00:00.000Z'),
        createdAt: new Date('2026-07-05T10:00:00.000Z'),
        receivedAt: new Date('2026-07-05T10:00:00.000Z'),
        updatedAt: new Date('2026-07-05T10:00:00.000Z'),
      });
      await writer.persistFromHvChargeSession(pre);
      await writer.persistFromHvChargeSession(post);
      const preRev = await prisma.batteryHvChargeSessionEvidenceRevision.findFirstOrThrow({
        where: { sourceHvChargeSessionId: pre.id },
      });
      expect(preRev.scientificEvidenceJson).not.toHaveProperty('lifecycleSegmentId');
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.coverage.lifecycleSegments.map((s) => s.lifecycleSegmentId)).toEqual([
        'HV_SEGMENT_0',
        'HV_SEGMENT_1',
      ]);
      const preCls = bundle.live.coverage.chargeSessionClassifications.find(
        (c) => c.sessionId === pre.id,
      );
      const postCls = bundle.live.coverage.chargeSessionClassifications.find(
        (c) => c.sessionId === post.id,
      );
      expect(preCls?.lifecycleSegmentId).toBe('HV_SEGMENT_0');
      expect(postCls?.lifecycleSegmentId).toBe('HV_SEGMENT_1');
    });

    it('K) metadata classification parity via full harness', async () => {
      const cases: Array<{
        name: string;
        metadata: Record<string, unknown>;
        expectedEligibility: string;
        expectedReason: string;
      }> = [
        {
          name: 'quality',
          metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.INVALID },
          expectedEligibility: 'INELIGIBLE_QUALITY',
          expectedReason: 'SESSION_QUALITY_INELIGIBLE',
        },
        {
          name: 'superseded',
          metadata: { supersededBySegmentFingerprint: 'native-fp' },
          expectedEligibility: 'INELIGIBLE_SUPERSEDED',
          expectedReason: 'SESSION_SUPERSEDED',
        },
        {
          name: 'startedBeforeRange',
          metadata: { startedBeforeRange: true },
          expectedEligibility: 'ELIGIBLE_NATIVE',
          expectedReason: 'SESSION_STARTED_BEFORE_QUERY_RANGE',
        },
      ];
      for (const testCase of cases) {
        const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
        const session = await createNativeSession(prisma, {
          organizationId,
          vehicleId,
          metadata: testCase.metadata,
        });
        await writer.persistFromHvChargeSession(session);
        const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        );
        const cls = bundle.live.throughput.sessionClassifications.find(
          (c) => c.sessionId === session.id,
        );
        expect(cls?.contributionEligibility).toBe(testCase.expectedEligibility);
        expect(cls?.reasonCodes).toContain(testCase.expectedReason);
      }
    });

    it('J) non-finite energy A2 parity from scientific JSON tags', async () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
        const session = await createNativeSession(prisma, {
          organizationId,
          vehicleId,
          segmentFingerprint: `fp-nf-${randomUUID()}`,
          energyAddedKwh: value,
        });
        await writer.persistFromHvChargeSession(session);
        const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        );
        const cls = bundle.live.throughput.sessionClassifications.find(
          (c) => c.sessionId === session.id,
        );
        expect(cls?.contributionEligibility).toBe('INELIGIBLE_MISSING_ENERGY');
        const rev = await prisma.batteryHvChargeSessionEvidenceRevision.findFirstOrThrow({
          where: { sourceHvChargeSessionId: session.id },
        });
        expect(rev.energyAddedKwh).toBeNull();
      }
    });

    it('E) multiple revisions collapse to one canonical session in A2 population', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-multi-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
      });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 20, updatedAt: new Date('2026-08-15T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { organizationId, vehicleId, segmentFingerprint: fp },
        }),
      ).toBe(2);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
    });

    it('M) corrupted durable revision fingerprint fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, { organizationId, vehicleId });
      const persisted = await writer.persistFromHvChargeSession(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: persisted.revision.id },
        data: { sourceRevisionFingerprint: '0'.repeat(64) },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceRevisionStoredFingerprintMismatchError);
    });

    it('O) missing durability ACK fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, { organizationId, vehicleId });
      const persisted = await writer.persistFromHvChargeSession(session);
      await prisma.batteryHvChargeSessionEvidenceAck.deleteMany({
        where: { revisionId: persisted.revision.id },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceRevisionMissingDurabilityAckError);
    });

    it('P) ambiguous effective revision tie fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-amb-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
        createdAt: KNOWABLE_ANCHOR,
        receivedAt: KNOWABLE_ANCHOR,
        updatedAt: KNOWABLE_ANCHOR,
      });
      const tie = new Date('2026-07-01T00:00:00.000Z');
      const p1 = projectionWithTiedKnowledgeEnvelope(session, { energyAddedKwh: 11, tie });
      const p2 = projectionWithTiedKnowledgeEnvelope(session, { energyAddedKwh: 12, tie });
      expect(
        computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(p1),
      ).not.toBe(computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(p2));
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p1,
        ordering: { capturedAt: tie, createdAt: tie },
      });
      await insertCoherentDurableRevisionV1(prisma, {
        projection: p2,
        ordering: { capturedAt: tie, createdAt: tie },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceEffectiveRevisionAmbiguityError);
    });
  },
);
