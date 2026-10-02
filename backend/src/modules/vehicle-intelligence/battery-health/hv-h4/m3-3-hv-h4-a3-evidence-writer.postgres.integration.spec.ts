import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { M3_3HvH4ChargeSessionEvidenceMaterializationRepository } from './m3-3-hv-h4-a3-charge-session-evidence-materialization.repository';
import {
  buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.persistence.mapper.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import type { M3_3HvH4ChargeSessionEvidencePersistenceInputV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

function persistenceInputWithProjectionPatch(
  base: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
  patch: Partial<M3_3HvH4ChargeSessionEvidenceScientificProjectionV1>,
): M3_3HvH4ChargeSessionEvidencePersistenceInputV1 {
  const projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
    ...base.projection,
    ...patch,
  };
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  return {
    projection,
    sourceRevisionFingerprint,
    mirror: mirrorFromScientificProjectionV1(projection),
  };
}

async function assertIsolatedMetadataRevisionAppend(input: {
  repo: M3_3HvH4ChargeSessionEvidenceMaterializationRepository;
  prisma: PrismaClient;
  baseline: M3_3HvH4ChargeSessionEvidencePersistenceInputV1;
  patched: M3_3HvH4ChargeSessionEvidencePersistenceInputV1;
}) {
  const { repo, prisma, baseline, patched } = input;
  const first = await repo.persistIdempotent(baseline);
  expect(first.persistenceOutcome).toBe('CREATED');
  const firstJson = first.revision.scientificEvidenceJson;
  const second = await repo.persistIdempotent(patched);
  expect(second.persistenceOutcome).toBe('CREATED');
  expect(second.revision.sourceRevisionFingerprint).not.toBe(first.sourceRevisionFingerprint);
  expect(second.revision.id).not.toBe(first.revision.id);
  const scope = {
    organizationId: baseline.projection.organizationId,
    vehicleId: baseline.projection.vehicleId,
    segmentFingerprint: baseline.projection.segmentFingerprint,
    evidenceContractVersion: baseline.projection.evidenceContractVersion,
  };
  expect(await prisma.batteryHvChargeSessionEvidenceRevision.count({ where: scope })).toBe(2);
  expect(await prisma.batteryHvChargeSessionEvidenceAck.count({ where: scope })).toBe(2);
  const reloadedFirst = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
    where: { id: first.revision.id },
  });
  expect(reloadedFirst.scientificEvidenceJson).toEqual(firstJson);
  expect(reloadedFirst.sourceRevisionFingerprint).toBe(first.sourceRevisionFingerprint);
}

async function createHvSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint?: string;
    energyAddedKwh?: number | null;
    metadata?: Record<string, unknown>;
    updatedAt?: Date;
  },
) {
  const startAt = new Date('2026-05-01T08:00:00.000Z');
  const endAt = new Date('2026-05-01T10:00:00.000Z');
  const anchor = endAt;
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
      energyAddedKwh:
        input.energyAddedKwh !== undefined ? input.energyAddedKwh : 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: anchor,
      receivedAt: anchor,
      updatedAt: input.updatedAt ?? anchor,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        ...(input.metadata ?? {}),
      },
    },
  });
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.2 evidence writer postgres',
  () => {
    let prisma: PrismaClient;
    let writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>;
    let repo: M3_3HvH4ChargeSessionEvidenceMaterializationRepository;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
      repo = new M3_3HvH4ChargeSessionEvidenceMaterializationRepository(prisma);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('A) first write creates exactly one revision and one matching ACK', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const result = await writer.persistFromHvChargeSession(session);
      expect(result.persistenceOutcome).toBe('CREATED');
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { organizationId, vehicleId, segmentFingerprint: session.segmentFingerprint },
        }),
      ).toBe(1);
      expect(
        await prisma.batteryHvChargeSessionEvidenceAck.count({
          where: { revisionId: result.revision.id },
        }),
      ).toBe(1);
      expect(result.ack.durabilityAckContractVersion).toBe(
        M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
      );
    });

    it('B) identical sequential retry is idempotent', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const first = await writer.persistFromHvChargeSession(session);
      const second = await writer.persistFromHvChargeSession(session);
      expect(first.persistenceOutcome).toBe('CREATED');
      expect(second.persistenceOutcome).toBe('ALREADY_EXISTS');
      expect(second.revision.id).toBe(first.revision.id);
      expect(second.ack.id).toBe(first.ack.id);
      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count()).toBeGreaterThan(0);
    });

    it('C) H4-relevant field change appends second revision and ACK', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 15, updatedAt: new Date('2026-06-01T00:00:00.000Z') },
      });
      const second = await writer.persistFromHvChargeSession(updated);
      expect(second.persistenceOutcome).toBe('CREATED');
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: {
            organizationId,
            vehicleId,
            segmentFingerprint: session.segmentFingerprint,
          },
        }),
      ).toBe(2);
      expect(
        await prisma.batteryHvChargeSessionEvidenceAck.count({
          where: { organizationId, vehicleId, segmentFingerprint: session.segmentFingerprint },
        }),
      ).toBe(2);
    });

    it('D) sourceUpdatedAt-only change creates new revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date('2026-07-01T00:00:00.000Z') },
      });
      const r = await writer.persistFromHvChargeSession(updated);
      expect(r.persistenceOutcome).toBe('CREATED');
    });

    it('E) providerSegmentId-only change creates new revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: {
          metadata: {
            providerSegmentId: 'prov-changed',
            addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
            qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          },
        },
      });
      const r = await writer.persistFromHvChargeSession(updated);
      expect(r.persistenceOutcome).toBe('CREATED');
    });

    it('F1) QUALITY_STATUS_ONLY_CHANGE appends isolated revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fixedProv = `prov-fixed-${randomUUID()}`;
      const session = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-f1-${randomUUID()}`,
        metadata: {
          providerSegmentId: fixedProv,
          addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          startedBeforeRange: false,
          supersededBySegmentFingerprint: null,
        },
      });
      const baseline = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      const patched = persistenceInputWithProjectionPatch(baseline, {
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL,
      });
      expect(patched.projection.providerSegmentId).toBe(baseline.projection.providerSegmentId);
      await assertIsolatedMetadataRevisionAppend({ repo, prisma, baseline, patched });
    });

    it('F2) SUPERSEDED_BY_SEGMENT_FINGERPRINT_ONLY_CHANGE appends isolated revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fixedProv = `prov-fixed-${randomUUID()}`;
      const session = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-f2-${randomUUID()}`,
        metadata: {
          providerSegmentId: fixedProv,
          addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          startedBeforeRange: false,
          supersededBySegmentFingerprint: null,
        },
      });
      const baseline = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      const patched = persistenceInputWithProjectionPatch(baseline, {
        supersededBySegmentFingerprint: `superseding-fp-${randomUUID()}`,
      });
      expect(patched.projection.qualityStatus).toBe(baseline.projection.qualityStatus);
      expect(patched.projection.providerSegmentId).toBe(baseline.projection.providerSegmentId);
      await assertIsolatedMetadataRevisionAppend({ repo, prisma, baseline, patched });
    });

    it('F3) STARTED_BEFORE_RANGE_ONLY_CHANGE appends isolated revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fixedProv = `prov-fixed-${randomUUID()}`;
      const session = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-f3-${randomUUID()}`,
        metadata: {
          providerSegmentId: fixedProv,
          addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          startedBeforeRange: false,
          supersededBySegmentFingerprint: null,
        },
      });
      const baseline = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      expect(baseline.projection.startedBeforeRange).toBe(false);
      const patched = persistenceInputWithProjectionPatch(baseline, {
        startedBeforeRange: true,
      });
      expect(patched.projection.qualityStatus).toBe(baseline.projection.qualityStatus);
      expect(patched.projection.providerSegmentId).toBe(baseline.projection.providerSegmentId);
      await assertIsolatedMetadataRevisionAppend({ repo, prisma, baseline, patched });
    });

    it('G/H/I) finite, NULL, and non-finite energy ledger semantics', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const finite = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-f-${randomUUID()}`,
        energyAddedKwh: 12.34,
      });
      const finiteResult = await writer.persistFromHvChargeSession(finite);
      expect(finiteResult.revision.energyAddedKwh).toBe(12.34);

      const nullSession = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-n-${randomUUID()}`,
        energyAddedKwh: null,
      });
      const nullResult = await writer.persistFromHvChargeSession(nullSession);
      expect(nullResult.revision.energyAddedKwh).toBeNull();

      const base = await createHvSession(prisma, { organizationId, vehicleId });
      const baseProjection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(base);
      for (const tagged of [
        { kind: 'NAN' as const },
        { kind: 'POSITIVE_INFINITY' as const },
        { kind: 'NEGATIVE_INFINITY' as const },
      ]) {
        const projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
          ...baseProjection,
          segmentFingerprint: `fp-${tagged.kind}-${randomUUID()}`,
          energyAddedKwh: tagged,
        };
        const input = {
          projection,
          sourceRevisionFingerprint:
            computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection),
          mirror: mirrorFromScientificProjectionV1(projection),
        };
        const r = await repo.persistIdempotent(input);
        expect(r.revision.energyAddedKwh).toBeNull();
        expect(
          (r.revision.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1)
            .energyAddedKwh,
        ).toEqual(tagged);
      }
    });

    it('J) concurrent identical writes converge to one revision and one ACK', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-conc-${randomUUID()}`,
      });
      const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => repo.persistIdempotent(input)),
      );
      const revisionIds = new Set(results.map((r) => r.revision.id));
      const ackIds = new Set(results.map((r) => r.ack.id));
      expect(revisionIds.size).toBe(1);
      expect(ackIds.size).toBe(1);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: {
            organizationId,
            vehicleId,
            segmentFingerprint: session.segmentFingerprint,
            sourceRevisionFingerprint: input.sourceRevisionFingerprint,
          },
        }),
      ).toBe(1);
    });

    it('K) corrupted scientific JSON with same identity fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      const tamperedProjection = {
        ...input.projection,
        energyAddedKwh: { kind: 'FINITE' as const, value: 999 },
      };
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: {
          organizationId: input.projection.organizationId,
          vehicleId: input.projection.vehicleId,
          sourceHvChargeSessionId: input.projection.sourceHvChargeSessionId,
          segmentFingerprint: input.projection.segmentFingerprint,
          evidenceContractVersion: input.projection.evidenceContractVersion,
          sourceRevisionFingerprint: input.sourceRevisionFingerprint,
          scientificEvidenceJson: tamperedProjection as unknown as Prisma.InputJsonValue,
          dimoSegmentId: input.mirror.dimoSegmentId,
          providerSegmentId: input.mirror.providerSegmentId,
          source: input.mirror.source,
          startAt: input.mirror.startAt,
          endAt: input.mirror.endAt,
          isOngoing: input.mirror.isOngoing,
          energyAddedKwh: input.mirror.energyAddedKwh,
          providerObservedAt: input.mirror.providerObservedAt,
          addedEnergyProvenance: input.mirror.addedEnergyProvenance,
          qualityStatus: input.mirror.qualityStatus,
          supersededBySegmentFingerprint: input.mirror.supersededBySegmentFingerprint,
          startedBeforeRange: input.mirror.startedBeforeRange,
          sourceCreatedAt: input.mirror.sourceCreatedAt,
          sourceReceivedAt: input.mirror.sourceReceivedAt,
          sourceUpdatedAt: input.mirror.sourceUpdatedAt,
        },
      });
      await expect(repo.persistIdempotent(input)).rejects.toBeInstanceOf(
        H4EvidenceRevisionStoredFingerprintMismatchError,
      );
    });

    it('L) stored fingerprint column disagreeing with JSON fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      const tamperedProjection = {
        ...input.projection,
        providerSegmentId: 'drifted-prov-id',
      };
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: {
          organizationId: input.projection.organizationId,
          vehicleId: input.projection.vehicleId,
          sourceHvChargeSessionId: input.projection.sourceHvChargeSessionId,
          segmentFingerprint: input.projection.segmentFingerprint,
          evidenceContractVersion: input.projection.evidenceContractVersion,
          sourceRevisionFingerprint: input.sourceRevisionFingerprint,
          scientificEvidenceJson: tamperedProjection as unknown as Prisma.InputJsonValue,
          dimoSegmentId: input.mirror.dimoSegmentId,
          providerSegmentId: input.mirror.providerSegmentId,
          source: input.mirror.source,
          startAt: input.mirror.startAt,
          endAt: input.mirror.endAt,
          isOngoing: input.mirror.isOngoing,
          energyAddedKwh: input.mirror.energyAddedKwh,
          providerObservedAt: input.mirror.providerObservedAt,
          addedEnergyProvenance: input.mirror.addedEnergyProvenance,
          qualityStatus: input.mirror.qualityStatus,
          supersededBySegmentFingerprint: input.mirror.supersededBySegmentFingerprint,
          startedBeforeRange: input.mirror.startedBeforeRange,
          sourceCreatedAt: input.mirror.sourceCreatedAt,
          sourceReceivedAt: input.mirror.sourceReceivedAt,
          sourceUpdatedAt: input.mirror.sourceUpdatedAt,
        },
      });
      await expect(repo.persistIdempotent(input)).rejects.toBeInstanceOf(
        H4EvidenceRevisionStoredFingerprintMismatchError,
      );
    });

    it('M) mirror incoherence fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.create({
        data: {
          organizationId: input.projection.organizationId,
          vehicleId: input.projection.vehicleId,
          sourceHvChargeSessionId: input.projection.sourceHvChargeSessionId,
          segmentFingerprint: input.projection.segmentFingerprint,
          evidenceContractVersion: input.projection.evidenceContractVersion,
          sourceRevisionFingerprint: input.sourceRevisionFingerprint,
          scientificEvidenceJson: input.projection as unknown as Prisma.InputJsonValue,
          dimoSegmentId: input.mirror.dimoSegmentId,
          providerSegmentId: input.mirror.providerSegmentId,
          source: input.mirror.source,
          startAt: input.mirror.startAt,
          endAt: input.mirror.endAt,
          isOngoing: input.mirror.isOngoing,
          energyAddedKwh: 999,
          providerObservedAt: input.mirror.providerObservedAt,
          addedEnergyProvenance: input.mirror.addedEnergyProvenance,
          qualityStatus: input.mirror.qualityStatus,
          supersededBySegmentFingerprint: input.mirror.supersededBySegmentFingerprint,
          startedBeforeRange: input.mirror.startedBeforeRange,
          sourceCreatedAt: input.mirror.sourceCreatedAt,
          sourceReceivedAt: input.mirror.sourceReceivedAt,
          sourceUpdatedAt: input.mirror.sourceUpdatedAt,
        },
      });
      await expect(repo.persistIdempotent(input)).rejects.toBeInstanceOf(
        H4EvidenceRevisionMirrorIncoherenceError,
      );
    });

    it('N) ACK identity mismatch fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const created = await writer.persistFromHvChargeSession(session);
      await prisma.batteryHvChargeSessionEvidenceAck.update({
        where: { id: created.ack.id },
        data: { vehicleId: 'wrong-vehicle-id' },
      });
      await expect(writer.persistFromHvChargeSession(session)).rejects.toBeInstanceOf(
        H4EvidenceAckIdentityMismatchError,
      );
    });

    it('O) tenant isolation prevents cross-org convergence', async () => {
      const a = await createGtOrgVehicle(prisma);
      const b = await createGtOrgVehicle(prisma);
      const seg = `fp-shared-${randomUUID()}`;
      const sessionA = await createHvSession(prisma, {
        organizationId: a.organizationId,
        vehicleId: a.vehicleId,
        segmentFingerprint: seg,
      });
      const sessionB = await createHvSession(prisma, {
        organizationId: b.organizationId,
        vehicleId: b.vehicleId,
        segmentFingerprint: seg,
      });
      const rA = await writer.persistFromHvChargeSession(sessionA);
      const rB = await writer.persistFromHvChargeSession(sessionB);
      expect(rA.revision.id).not.toBe(rB.revision.id);
    });

    it('P) idempotent retry does not mutate revision scientific fields', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const first = await writer.persistFromHvChargeSession(session);
      const capturedAt = first.revision.capturedAt;
      const jsonBefore = first.revision.scientificEvidenceJson;
      await writer.persistFromHvChargeSession(session);
      const reloaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
        where: { id: first.revision.id },
      });
      expect(reloaded.capturedAt.getTime()).toBe(capturedAt.getTime());
      expect(reloaded.scientificEvidenceJson).toEqual(jsonBefore);
    });

    it('Q) deleting source HvChargeSession does not mutate durable revision', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createHvSession(prisma, { organizationId, vehicleId });
      const persisted = await writer.persistFromHvChargeSession(session);
      await prisma.hvChargeSession.delete({ where: { id: session.id } });
      const still = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
        where: { id: persisted.revision.id },
      });
      expect(still.sourceHvChargeSessionId).toBe(session.id);
    });

    it('R) ACK_STAGE_FAILURE_ROLLS_BACK_NEW_REVISION', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const seedSession = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-seed-${randomUUID()}`,
      });
      const seedPersisted = await writer.persistFromHvChargeSession(seedSession);

      const targetSession = await createHvSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: `fp-target-rollback-${randomUUID()}`,
      });
      const targetInput =
        buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(targetSession);

      await prisma.batteryHvChargeSessionEvidenceAck.create({
        data: {
          organizationId: targetInput.projection.organizationId,
          vehicleId: targetInput.projection.vehicleId,
          segmentFingerprint: targetInput.projection.segmentFingerprint,
          evidenceContractVersion: targetInput.projection.evidenceContractVersion,
          sourceRevisionFingerprint: targetInput.sourceRevisionFingerprint,
          revisionId: seedPersisted.revision.id,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });

      const targetScope = {
        organizationId: targetInput.projection.organizationId,
        vehicleId: targetInput.projection.vehicleId,
        segmentFingerprint: targetInput.projection.segmentFingerprint,
        evidenceContractVersion: targetInput.projection.evidenceContractVersion,
        sourceRevisionFingerprint: targetInput.sourceRevisionFingerprint,
      };

      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count({ where: targetScope })).toBe(
        0,
      );

      await expect(repo.persistIdempotent(targetInput)).rejects.toBeInstanceOf(
        H4EvidenceAckIdentityMismatchError,
      );

      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count({ where: targetScope })).toBe(
        0,
      );
      expect(
        await prisma.batteryHvChargeSessionEvidenceAck.count({
          where: {
            ...targetScope,
            durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
            revisionId: seedPersisted.revision.id,
          },
        }),
      ).toBe(1);
    });
  },
);
