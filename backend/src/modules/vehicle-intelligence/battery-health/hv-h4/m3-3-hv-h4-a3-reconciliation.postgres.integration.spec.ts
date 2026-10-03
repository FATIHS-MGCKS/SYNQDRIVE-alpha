import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import { BatteryHvH4A3ReconciliationModule } from './battery-hv-h4-a3-reconciliation.module';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import {
  deleteHvChargeSessionIfDurablyAcknowledgedV1,
} from './m3-3-hv-h4-a3-retention-gate.v1';
import {
  M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY,
  M3_3HvH4A3ReconciliationCursorStore,
} from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { M3_3HvH4A3ReconciliationService } from './m3-3-hv-h4-a3-reconciliation.service';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const OLD_START = new Date('2019-06-01T08:00:00.000Z');
const OLD_END = new Date('2019-06-01T10:00:00.000Z');
const RETENTION_CUTOFF = new Date('2024-01-01T00:00:00.000Z');

class InMemoryRedis {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }
}

async function createSession(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  overrides: { id?: string; segmentFingerprint?: string; energyAddedKwh?: number } = {},
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

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.5 reconciliation postgres',
  () => {
    let prisma: PrismaClient;
    let service: M3_3HvH4A3ReconciliationService;
    let cursorStore: M3_3HvH4A3ReconciliationCursorStore;
    const redis = new InMemoryRedis();

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_ENABLED = 'true';
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE = '25';
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT = '50';

      const moduleRef = await Test.createTestingModule({
        imports: [BatteryHvH4A3ReconciliationModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(RedisService)
        .useValue(redis)
        .compile();

      service = moduleRef.get(M3_3HvH4A3ReconciliationService);
      cursorStore = moduleRef.get(M3_3HvH4A3ReconciliationCursorStore);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await cursorStore.clear();
      await prisma.batteryHvChargeSessionEvidenceAck.deleteMany();
      await prisma.batteryHvChargeSessionEvidenceRevision.deleteMany();
      await prisma.hvChargeSession.deleteMany();
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE = '25';
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT = '50';
    });

    it('C) missing revision → exact revision + ACK', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId);
      const outcome = await service.reconcileLiveSessionRow(session.id);
      expect(outcome.classification).toBe('CREATED');
      expect(outcome.persistenceEffect).toBe('REVISION_CREATED');
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { sourceHvChargeSessionId: session.id },
        }),
      ).toBe(1);
      expect(await prisma.batteryHvChargeSessionEvidenceAck.count()).toBe(1);
    });

    it('D) idempotent second pass', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId);
      expect((await service.reconcileLiveSessionRow(session.id)).classification).toBe('CREATED');
      const revCount = await prisma.batteryHvChargeSessionEvidenceRevision.count();
      const ackCount = await prisma.batteryHvChargeSessionEvidenceAck.count();
      const second = await service.reconcileLiveSessionRow(session.id);
      expect(second.classification).toBe('ALREADY_DURABLE');
      expect(second.persistenceEffect).toBe('NONE');
      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count()).toBe(revCount);
      expect(await prisma.batteryHvChargeSessionEvidenceAck.count()).toBe(ackCount);
    });

    it('E) stale revision → new current revision', async () => {
      const writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId);
      await writer.persistFromHvChargeSession(session);
      const r1 = await prisma.batteryHvChargeSessionEvidenceRevision.count();
      await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 18, updatedAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      expect((await service.reconcileLiveSessionRow(session.id)).classification).toBe('CREATED');
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { segmentFingerprint: session.segmentFingerprint },
        }),
      ).toBeGreaterThan(r1);
    });

    it('F) exact current ACK repair — historical ACK does not mask', async () => {
      const writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId, {
        energyAddedKwh: 10,
      });
      await writer.persistFromHvChargeSession(session);
      await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 18, updatedAt: new Date('2020-01-01T00:00:00.000Z') },
      });
      const updated = await prisma.hvChargeSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      const r2 = await writer.persistFromHvChargeSession(updated);
      await prisma.batteryHvChargeSessionEvidenceAck.deleteMany({
        where: { revisionId: r2.revision.id },
      });
      expect(await prisma.batteryHvChargeSessionEvidenceAck.count()).toBeGreaterThan(0);
      const revBefore = await prisma.batteryHvChargeSessionEvidenceRevision.count();
      const outcome = await service.reconcileLiveSessionRow(session.id);
      expect(outcome.classification).toBe('ACK_REPAIRED');
      expect(outcome.persistenceEffect).toBe('ACK_REPAIRED');
      expect(await prisma.batteryHvChargeSessionEvidenceRevision.count()).toBe(revBefore);
    });

    it('M) re-ingested raw id B independent of A', async () => {
      const writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-reingest-${randomUUID()}`;
      const idA = randomUUID();
      const sessionA = await createSession(prisma, organizationId, vehicleId, {
        id: idA,
        segmentFingerprint: fp,
      });
      await writer.persistFromHvChargeSession(sessionA);
      await prisma.hvChargeSession.delete({ where: { id: idA } });
      const sessionB = await createSession(prisma, organizationId, vehicleId, {
        segmentFingerprint: fp,
      });
      expect((await service.reconcileLiveSessionRow(sessionB.id)).classification).toBe('CREATED');
    });

    it('I) multi-tick cursor progress — no front-page starvation', async () => {
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_INSPECTION_LIMIT = '2';
      process.env.BATTERY_HV_H4_A3_RECONCILIATION_BATCH_SIZE = '25';
      const writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const ids = [
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
      ];
      for (const id of ids.slice(0, 2)) {
        const s = await createSession(prisma, organizationId, vehicleId, { id });
        await writer.persistFromHvChargeSession(s);
      }
      for (const id of ids.slice(2)) {
        await createSession(prisma, organizationId, vehicleId, { id });
      }

      const tick1 = await service.runBoundedReconciliationTick();
      expect(tick1.result).toBe('COMPLETED');
      expect(tick1.inspectedCount).toBe(2);
      const cursor1 = await redis.get(M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY);
      expect(cursor1).toContain('000000000002');

      const tick2 = await service.runBoundedReconciliationTick();
      expect(tick2.inspectedCount).toBe(2);
      const cursor2 = await redis.get(M3_3_HV_H4_A3_RECONCILIATION_CURSOR_REDIS_KEY);
      expect(cursor2).toContain('000000000004');

      const tick3 = await service.runBoundedReconciliationTick();
      expect(tick3.inspectedCount).toBe(1);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { sourceHvChargeSessionId: ids[4] },
        }),
      ).toBe(1);
    });

    it('O) concurrent reconcileLiveSessionRow converges', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId);
      const settled = await Promise.allSettled([
        service.reconcileLiveSessionRow(session.id),
        service.reconcileLiveSessionRow(session.id),
        service.reconcileLiveSessionRow(session.id),
      ]);
      for (const entry of settled) {
        expect(entry.status).toBe('fulfilled');
        const r = (entry as PromiseFulfilledResult<Awaited<ReturnType<typeof service.reconcileLiveSessionRow>>>).value;
        expect(['CREATED', 'ALREADY_DURABLE', 'ACK_REPAIRED']).toContain(r.classification);
      }
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { sourceHvChargeSessionId: session.id },
        }),
      ).toBe(1);
      expect(await prisma.batteryHvChargeSessionEvidenceAck.count()).toBe(1);
    });

    it('Q) retention handoff — reconciliation establishes durability, gate deletes', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createSession(prisma, organizationId, vehicleId);
      const blocked = await prisma.$transaction((tx) =>
        deleteHvChargeSessionIfDurablyAcknowledgedV1({
          db: tx,
          sessionId: session.id,
          retentionCutoff: RETENTION_CUTOFF,
        }),
      );
      expect(blocked.kind).toBe('BLOCKED');
      expect((await service.reconcileLiveSessionRow(session.id)).classification).toBe('CREATED');
      const allowed = await prisma.$transaction((tx) =>
        deleteHvChargeSessionIfDurablyAcknowledgedV1({
          db: tx,
          sessionId: session.id,
          retentionCutoff: RETENTION_CUTOFF,
        }),
      );
      expect(allowed.kind).toBe('DELETED');
    });
  },
);
