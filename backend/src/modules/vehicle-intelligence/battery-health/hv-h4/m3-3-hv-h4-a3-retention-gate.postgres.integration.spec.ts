import { randomUUID } from 'crypto';
import { BatteryMeasurementQuality, Prisma, PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import {
  deleteHvChargeSessionIfDurablyAcknowledgedV1,
  evaluateCurrentHvChargeSessionPruneDurabilityV1,
} from './m3-3-hv-h4-a3-retention-gate.v1';
import { M3_3_HV_H4_A3_RETENTION_GATE_REASON } from './m3-3-hv-h4-a3-retention-gate.types.v1';
import { runM3_3HvH4DurableModeAA2ReportBundleV1 } from './m3-3-hv-h4-a3-parity.harness.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const RETENTION_CUTOFF = new Date('2024-01-01T00:00:00.000Z');
const OLD_START = new Date('2019-06-01T08:00:00.000Z');
const OLD_END = new Date('2019-06-01T10:00:00.000Z');
const EVAL = new Date('2026-09-01T00:00:00.000Z');

async function createEligibleSession(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  overrides: {
    id?: string;
    segmentFingerprint?: string;
    energyAddedKwh?: number;
  } = {},
) {
  return prisma.hvChargeSession.create({
    data: {
      id: overrides.id ?? randomUUID(),
      organizationId,
      vehicleId,
      segmentFingerprint: overrides.segmentFingerprint ?? `fp-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: OLD_START,
      endAt: OLD_END,
      energyAddedKwh: overrides.energyAddedKwh ?? 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: OLD_END,
      receivedAt: OLD_END,
      updatedAt: OLD_END,
      providerObservedAt: OLD_END,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    },
  });
}

async function persistCurrentRevision(
  writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>,
  session: Awaited<ReturnType<typeof createEligibleSession>>,
) {
  return writer.persistFromHvChargeSession(session);
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.4 retention ACK gate postgres',
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

    async function txDelete(sessionId: string) {
      return prisma.$transaction((tx) =>
        deleteHvChargeSessionIfDurablyAcknowledgedV1({
          db: tx,
          sessionId,
          retentionCutoff: RETENTION_CUTOFF,
        }),
      );
    }

    it('A) no durable revision blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_CURRENT_REVISION_MISSING');
    });

    it('B) revision without ACK blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      await prisma.batteryHvChargeSessionEvidenceAck.deleteMany({
        where: { revisionId: persisted.revision.id },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_ACK_MISSING');
    });

    it('C/L) stale revision + ACK after live mutation blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await persistCurrentRevision(writer, session);
      await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 19, updatedAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.reasonCode).toBe(
        M3_3_HV_H4_A3_RETENTION_GATE_REASON.CURRENT_SOURCE_REVISION_NOT_DURABLY_ACKED,
      );
    });

    it('D) exact current revision + ACK deletes raw row only', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('DELETED');
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(0);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { id: persisted.revision.id },
        }),
      ).toBe(1);
      expect(
        await prisma.batteryHvChargeSessionEvidenceAck.count({
          where: { revisionId: persisted.revision.id },
        }),
      ).toBe(1);
      const bundle = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
    });

    it('E) ACK identity mismatch blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      const otherSession = await createEligibleSession(prisma, organizationId, vehicleId);
      const otherPersisted = await persistCurrentRevision(writer, otherSession);
      const ack = await prisma.batteryHvChargeSessionEvidenceAck.findFirstOrThrow({
        where: { revisionId: persisted.revision.id },
      });
      await prisma.batteryHvChargeSessionEvidenceAck.update({
        where: { id: ack.id },
        data: { revisionId: otherPersisted.revision.id },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_ACK_IDENTITY_MISMATCH');
    });

    it('F) corrupted revision fingerprint blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      const json = persisted.revision.scientificEvidenceJson as Record<string, unknown>;
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: persisted.revision.id },
        data: {
          scientificEvidenceJson: { ...json, energyAddedKwh: { tag: 'NAN' } },
        },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_REVISION_INTEGRITY');
    });

    it('G) mirror incoherence blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: persisted.revision.id },
        data: { energyAddedKwh: 99 },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_REVISION_INTEGRITY');
    });

    it('H) incompatible contract version does not authorize delete', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
        session,
        'LEGACY_CONTRACT_V0',
      );
      const fp = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
      const mirror = mirrorFromScientificProjectionV1(projection);
      const revision = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: {
          organizationId,
          vehicleId,
          sourceHvChargeSessionId: session.id,
          segmentFingerprint: mirror.segmentFingerprint,
          evidenceContractVersion: 'LEGACY_CONTRACT_V0',
          sourceRevisionFingerprint: fp,
          scientificEvidenceJson: projection as unknown as Prisma.InputJsonValue,
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
        },
      });
      await prisma.batteryHvChargeSessionEvidenceAck.create({
        data: {
          organizationId,
          vehicleId,
          segmentFingerprint: revision.segmentFingerprint,
          evidenceContractVersion: revision.evidenceContractVersion,
          sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
          revisionId: revision.id,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_CURRENT_REVISION_MISSING');
    });

    it('I) capacity observation reference blocks prune', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await persistCurrentRevision(writer, session);
      await prisma.hvCapacityObservation.create({
        data: {
          organizationId,
          vehicleId,
          chargeSessionId: session.id,
          method: HV_M2_CAPACITY_METHOD,
          observedAt: OLD_END,
          idempotencyKey: `cap-${randomUUID()}`,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
        },
      });
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
      expect(outcome.blockKind).toBe('BLOCKED_CAPACITY_OBSERVATION_REFERENCE');
    });

    it('J) dry-run eligible without delete or mutation', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const persisted = await persistCurrentRevision(writer, session);
      const beforeAck = await prisma.batteryHvChargeSessionEvidenceAck.findFirstOrThrow({
        where: { revisionId: persisted.revision.id },
      });
      const outcome = await evaluateCurrentHvChargeSessionPruneDurabilityV1({
        db: prisma,
        session,
        retentionCutoff: RETENTION_CUTOFF,
      });
      expect(outcome.kind).toBe('DRY_RUN_ELIGIBLE');
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(1);
      const afterAck = await prisma.batteryHvChargeSessionEvidenceAck.findFirstOrThrow({
        where: { id: beforeAck.id },
      });
      expect(afterAck.acknowledgedAt.toISOString()).toBe(beforeAck.acknowledgedAt.toISOString());
    });

    it('K) concurrent destructive attempts converge to one delete', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await persistCurrentRevision(writer, session);
      const [first, second] = await Promise.all([txDelete(session.id), txDelete(session.id)]);
      const deleted = [first, second].filter((o) => o.kind === 'DELETED').length;
      expect(deleted).toBe(1);
      expect(await prisma.hvChargeSession.count({ where: { id: session.id } })).toBe(0);
    });

    it('M) re-ingested source id with stale ACK for old id blocks delete', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-reingest-${randomUUID()}`;
      const oldId = randomUUID();
      const oldSession = await createEligibleSession(prisma, organizationId, vehicleId, {
        id: oldId,
        segmentFingerprint: fp,
      });
      await persistCurrentRevision(writer, oldSession);
      await prisma.hvChargeSession.delete({ where: { id: oldId } });
      const newSession = await createEligibleSession(prisma, organizationId, vehicleId, {
        segmentFingerprint: fp,
      });
      const outcome = await txDelete(newSession.id);
      expect(outcome.kind).toBe('BLOCKED');
    });

    it('N) multiple historical revisions allow delete when current ACK matches', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      await persistCurrentRevision(writer, session);
      await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 14, updatedAt: new Date('2020-02-01T00:00:00.000Z') },
      });
      const updated = await prisma.hvChargeSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      await persistCurrentRevision(writer, updated);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { segmentFingerprint: session.segmentFingerprint },
        }),
      ).toBeGreaterThan(1);
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('DELETED');
    });

    it('O) tenant isolation — foreign org revision never authorizes delete', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const other = await createGtOrgVehicle(prisma);
      const session = await createEligibleSession(prisma, organizationId, vehicleId);
      const otherSession = await createEligibleSession(prisma, other.organizationId, other.vehicleId);
      await persistCurrentRevision(writer, otherSession);
      const outcome = await txDelete(session.id);
      expect(outcome.kind).toBe('BLOCKED');
    });
  },
);
