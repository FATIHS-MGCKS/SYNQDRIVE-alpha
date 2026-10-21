import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createGtOrgVehicle,
} from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  buildM3_3HvH4ChargeSessionEvidenceMirrorFromSessionV1,
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import {
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
  scientificEvidenceJsonMatchesCanonicalFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import { assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1 } from './m3-3-hv-h4-a3-charge-session-evidence-mirror.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import type { M3_3HvH4TaggedEnergyAddedKwhV1 } from './m3-3-hv-h4-a3-energy-encoding.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

function revisionRowFromSession(
  session: Awaited<ReturnType<typeof createHvSession>>,
  fingerprintOverride?: string,
) {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  const sourceRevisionFingerprint =
    fingerprintOverride ?? computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  const mirror = buildM3_3HvH4ChargeSessionEvidenceMirrorFromSessionV1(session);
  return {
    organizationId: session.organizationId,
    vehicleId: session.vehicleId,
    sourceHvChargeSessionId: session.id,
    segmentFingerprint: session.segmentFingerprint,
    evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    sourceRevisionFingerprint,
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
  };
}

function revisionRowFromProjection(
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
) {
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  const mirror = mirrorFromScientificProjectionV1(projection);
  return {
    organizationId: projection.organizationId,
    vehicleId: projection.vehicleId,
    sourceHvChargeSessionId: projection.sourceHvChargeSessionId,
    segmentFingerprint: projection.segmentFingerprint,
    evidenceContractVersion: projection.evidenceContractVersion,
    sourceRevisionFingerprint,
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
  };
}

async function createHvSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint?: string;
    energyAddedKwh?: number | null;
  },
) {
  const startAt = new Date('2026-05-01T08:00:00.000Z');
  const endAt = new Date('2026-05-01T10:00:00.000Z');
  return prisma.hvChargeSession.create({
    data: {
      id: randomUUID(),
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
      createdAt: endAt,
      receivedAt: endAt,
      updatedAt: endAt,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: 'QUALIFIED',
      },
    },
  });
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3 evidence revision postgres schema',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('A) two revisions same canonical session different fingerprints allowed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const row1 = revisionRowFromSession(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row1 });

      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 15, updatedAt: new Date('2026-06-02T00:00:00.000Z') },
      });
      const row2 = revisionRowFromSession(updated);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row2 });

      const count = await prisma.batteryHvChargeSessionEvidenceRevision.count({
        where: { organizationId, vehicleId, segmentFingerprint: session.segmentFingerprint },
      });
      expect(count).toBe(2);
    });

    it('B) duplicate scientific identity rejected', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const row = revisionRowFromSession(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row });
      await expect(
        prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row }),
      ).rejects.toThrow();
    });

    it('C) same fingerprint different canonical session allowed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const s1 = await createHvSession(prisma, { organizationId, vehicleId, segmentFingerprint: 'fp-a' });
      const s2 = await createHvSession(prisma, { organizationId, vehicleId, segmentFingerprint: 'fp-b' });
      const fp = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
        buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(s1),
      );
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(s1, fp),
      });
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(s2, fp),
      });
    });

    it('D) same session different evidenceContractVersion allowed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const projectionV1 = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
      const fpV1 = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projectionV1);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(session, fpV1),
      });
      const projectionV2 = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
        session,
        'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V2',
      );
      const fpV2 = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projectionV2);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: {
          ...revisionRowFromSession(session, fpV2),
          evidenceContractVersion: 'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V2',
          scientificEvidenceJson: projectionV2 as unknown as Prisma.InputJsonValue,
        },
      });
    });

    it('E) sourceHvChargeSessionId may repeat across revisions', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const row1 = revisionRowFromSession(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row1 });
      const row2 = revisionRowFromSession(
        await prisma.hvChargeSession.update({
          where: { id: session.id },
          data: { energyAddedKwh: 9 },
        }),
      );
      expect(row2.sourceHvChargeSessionId).toBe(session.id);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row2 });
    });

    it('F) deleting HvChargeSession preserves durable revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const row = revisionRowFromSession(session);
      const rev = await prisma.batteryHvChargeSessionEvidenceRevision.create({ data: row });
      await prisma.hvChargeSession.delete({ where: { id: session.id } });
      const still = await prisma.batteryHvChargeSessionEvidenceRevision.findUnique({
        where: { id: rev.id },
      });
      expect(still?.sourceHvChargeSessionId).toBe(session.id);
    });

    it('G) deleting vehicle cascades revisions', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(session),
      });
      const before = await prisma.batteryHvChargeSessionEvidenceRevision.count({
        where: { vehicleId },
      });
      expect(before).toBe(1);
      await prisma.$executeRaw`
        DELETE FROM vehicles
        WHERE id = ${vehicleId}::text
      `;
      const after = await prisma.batteryHvChargeSessionEvidenceRevision.count({
        where: { vehicleId },
      });
      expect(after).toBe(0);
    });

    it('H) deleting organization cascades revisions', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(session),
      });
      await prisma.organization.delete({ where: { id: organizationId } });
      const count = await prisma.batteryHvChargeSessionEvidenceRevision.count({
        where: { organizationId },
      });
      expect(count).toBe(0);
    });

    it('I) ACK cannot reference nonexistent revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      await expect(
        prisma.batteryHvChargeSessionEvidenceAck.create({
          data: {
            organizationId,
            vehicleId,
            segmentFingerprint: 'fp-x',
            evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
            sourceRevisionFingerprint: 'a'.repeat(64),
            revisionId: randomUUID(),
            durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
          },
        }),
      ).rejects.toThrow();
    });

    it('J) deleting revision cascades ACK', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const rev = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(session),
      });
      await prisma.batteryHvChargeSessionEvidenceAck.create({
        data: {
          organizationId,
          vehicleId,
          segmentFingerprint: session.segmentFingerprint,
          evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
          sourceRevisionFingerprint: rev.sourceRevisionFingerprint,
          revisionId: rev.id,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });
      await prisma.batteryHvChargeSessionEvidenceRevision.delete({ where: { id: rev.id } });
      const ackCount = await prisma.batteryHvChargeSessionEvidenceAck.count({
        where: { revisionId: rev.id },
      });
      expect(ackCount).toBe(0);
    });

    it('K/L) two revision-specific ACK rows may coexist', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const rev1 = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(session),
      });
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 20 },
      });
      const rev2 = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromSession(updated),
      });
      await prisma.batteryHvChargeSessionEvidenceAck.create({
        data: {
          organizationId,
          vehicleId,
          segmentFingerprint: session.segmentFingerprint,
          evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
          sourceRevisionFingerprint: rev1.sourceRevisionFingerprint,
          revisionId: rev1.id,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });
      await prisma.batteryHvChargeSessionEvidenceAck.create({
        data: {
          organizationId,
          vehicleId,
          segmentFingerprint: session.segmentFingerprint,
          evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
          sourceRevisionFingerprint: rev2.sourceRevisionFingerprint,
          revisionId: rev2.id,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });
      const acks = await prisma.batteryHvChargeSessionEvidenceAck.findMany({
        where: { organizationId, vehicleId, segmentFingerprint: session.segmentFingerprint },
      });
      expect(acks.length).toBe(2);
    });

    it('M) evidence ledger: tagged scientific JSON authority + finite-only float mirror', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const baseProjection =
        buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);

      const finiteProjection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
        ...baseProjection,
        segmentFingerprint: `fp-finite-${randomUUID()}`,
        energyAddedKwh: { kind: 'FINITE', value: 12.34 },
      };
      const finiteRev = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromProjection(finiteProjection),
      });
      const finiteLoaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUnique({
        where: { id: finiteRev.id },
      });
      expect(finiteLoaded?.energyAddedKwh).toBe(12.34);
      const finiteJson =
        finiteLoaded!.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
      expect(finiteJson.energyAddedKwh).toEqual({ kind: 'FINITE', value: 12.34 });

      const nullProjection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
        ...baseProjection,
        segmentFingerprint: `fp-null-${randomUUID()}`,
        energyAddedKwh: { kind: 'NULL' },
      };
      const nullRev = await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: revisionRowFromProjection(nullProjection),
      });
      const nullLoaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUnique({
        where: { id: nullRev.id },
      });
      expect(nullLoaded?.energyAddedKwh).toBeNull();
      expect(
        (nullLoaded!.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1)
          .energyAddedKwh,
      ).toEqual({ kind: 'NULL' });

      const nonFiniteCases: {
        label: string;
        tagged: M3_3HvH4TaggedEnergyAddedKwhV1;
      }[] = [
        { label: 'NaN', tagged: { kind: 'NAN' } },
        { label: '+Infinity', tagged: { kind: 'POSITIVE_INFINITY' } },
        { label: '-Infinity', tagged: { kind: 'NEGATIVE_INFINITY' } },
      ];

      for (const { label, tagged } of nonFiniteCases) {
        const projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
          ...baseProjection,
          segmentFingerprint: `fp-${label}-${randomUUID()}`,
          energyAddedKwh: tagged,
        };
        const rev = await prisma.batteryHvChargeSessionEvidenceRevision.create({
          data: revisionRowFromProjection(projection),
        });
        const loaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUnique({
          where: { id: rev.id },
          select: {
            energyAddedKwh: true,
            scientificEvidenceJson: true,
            sourceRevisionFingerprint: true,
          },
        });
        expect(loaded).not.toBeNull();
        expect(loaded!.energyAddedKwh).toBeNull();
        const json =
          loaded!.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1;
        expect(json.energyAddedKwh).toEqual(tagged);
        expect(
          scientificEvidenceJsonMatchesCanonicalFingerprintV1({
            scientificEvidenceJson: json,
            sourceRevisionFingerprint: loaded!.sourceRevisionFingerprint,
          }),
        ).toBe(true);
        assertM3_3HvH4ChargeSessionEvidenceMirrorCoherentV1({
          projection: json,
          mirror: mirrorFromScientificProjectionV1(json),
        });
      }
    });
  },
);
