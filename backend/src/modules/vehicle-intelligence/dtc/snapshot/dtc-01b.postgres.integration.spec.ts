/**
 * DTC-01B/01C PostgreSQL integration (disposable DB only).
 *   DTC_01B_PG_INTEGRATION=1 DATABASE_URL=postgresql://…/dtc01b_test_… npm test -- dtc-01b.postgres
 */
import { PrismaClient } from '@prisma/client';
import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { DtcService } from '../dtc.service';
import {
  buildPollSignalsLatestProposal,
  buildWebhookObdDtcProposal,
} from './dtc-snapshot-proposal.builder';
import { assertDtc01bDisposablePostgresTarget } from './dtc-01b-postgres-guard';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import { randomUUID } from 'node:crypto';
import { insertDimoMirrorForPostgresTests } from '../../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import type { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';

const LIVE = process.env.DTC_01B_PG_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('DTC snapshot apply (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let apply: DtcSnapshotApplyService;
  const orgIds: string[] = [];

  const pgNotificationIngest = {
    ingestVehicleHealthSources: async () => undefined,
  } as unknown as NotificationProducerIngestService;

  function makeApplyService(): DtcSnapshotApplyService {
    return new DtcSnapshotApplyService(
      prisma as never,
      new DtcService(prisma as never),
      pgNotificationIngest,
    );
  }

  beforeAll(() => {
    assertDtc01bDisposablePostgresTarget();
    apply = makeApplyService();
  });

  afterEach(async () => {
    while (orgIds.length) {
      const orgId = orgIds.pop()!;
      await prisma.vehicleDtcSnapshotOutbox.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicleDtcSourceHead.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicleDtcEvent.deleteMany({
        where: { vehicle: { organizationId: orgId } },
      });
      await prisma.vehicleLatestState.deleteMany({
        where: { vehicle: { organizationId: orgId } },
      });
      await prisma.vehicleDataSourceLink.deleteMany({
        where: { vehicle: { organizationId: orgId } },
      });
      await prisma.dimoVehicle.deleteMany({
        where: { registeredVehicles: { some: { organizationId: orgId } } },
      });
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture(tokenId = 42001) {
    const org = await prisma.organization.create({
      data: {
        companyName: `dtc01b-${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgIds.push(org.id);
    const dimoId = randomUUID();
    const externalId = `ext-${Date.now()}`;
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId,
      tokenId,
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        licensePlate: 'DTC-01B',
        make: 'VW',
        model: 'Golf',
        year: 2024,
        fuelType: 'GASOLINE',
        status: 'AVAILABLE',
        dimoVehicleId: dimoId,
      },
    });
    const link = await prisma.vehicleDataSourceLink.create({
      data: {
        vehicleId: vehicle.id,
        provider: 'DIMO',
        sourceType: 'DIMO',
        isActive: true,
        dimoVehicleId: dimoId,
        activatedAt: new Date(),
      },
    });
    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: vehicle.id,
        sourceTimestamp: new Date('2020-01-01T00:00:00Z'),
        providerFetchedAt: new Date('2020-01-01T00:00:00Z'),
        providerBindingId: 'global-binding',
        syncJobRef: 'other-module',
        rawPayloadJson: { other: true },
      },
    });
    return {
      org,
      vehicle,
      binding: {
        provider: 'DIMO' as const,
        providerBindingId: link.id,
        dimoTokenId: tokenId,
      },
    };
  }

  it('does not overwrite global VLS provenance on apply', async () => {
    const { org, vehicle, binding } = await fixture();
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'pg-1',
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: ['P0301'] },
    });
    await apply.applyBuiltProposal(built);
    const vls = await prisma.vehicleLatestState.findUnique({
      where: { vehicleId: vehicle.id },
    });
    expect(vls?.sourceTimestamp?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(vls?.providerBindingId).toBe('global-binding');
    expect(vls?.obdDtcList).toEqual(['P0301']);
  });

  it('rejects mixed invalid payload without clearing active codes', async () => {
    const { org, vehicle, binding } = await fixture();
    await prisma.vehicleDtcEvent.create({
      data: {
        vehicleId: vehicle.id,
        dtcCode: 'P0301',
        severity: 'WARNING',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'pg-partial',
      obdDtcListSignal: { timestamp: '2026-10-15T11:30:00Z', value: ['P0301', 'BAD'] },
    });
    expect(built.ok).toBe(false);
    const active = await prisma.vehicleDtcEvent.count({
      where: { vehicleId: vehicle.id, isActive: true },
    });
    expect(active).toBe(1);
  });

  it('defers clears when complete snapshot is older than partial webhook', async () => {
    const { org, vehicle, binding } = await fixture();
    await prisma.vehicleDtcEvent.create({
      data: {
        vehicleId: vehicle.id,
        dtcCode: 'P0301',
        severity: 'WARNING',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    const wh = buildWebhookObdDtcProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T13:00:00Z'),
      auditRef: 'pg-wh-first',
      value: 'P0420',
      webhookTimestamp: '2026-10-15T12:30:00Z',
    });
    await apply.applyBuiltProposal(wh);

    const complete = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T13:30:00Z'),
      auditRef: 'pg-complete-defer',
      obdDtcListSignal: { timestamp: '2026-10-15T12:00:00Z', value: [] },
    });
    const result = await apply.applyBuiltProposal(complete);
    expect(result.decision.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS');
    const stillActive = await prisma.vehicleDtcEvent.findMany({
      where: { vehicleId: vehicle.id, isActive: true },
      select: { dtcCode: true },
    });
    expect(stillActive.map((e) => e.dtcCode).sort()).toEqual(['P0301', 'P0420']);
  });

  it('recovers outbox after simulated crash (no flush)', async () => {
    const { org, vehicle, binding } = await fixture();
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T14:00:00Z'),
      auditRef: 'pg-crash',
      obdDtcListSignal: { timestamp: '2026-10-15T13:00:00Z', value: ['P0301'] },
    });

    const crashApply = makeApplyService();
    const orig = crashApply.recoverPendingOutbox.bind(crashApply);
    crashApply.recoverPendingOutbox = async () => ({ processed: 0, failed: 0 });

    await crashApply.applyBuiltProposal(built);
    const pending = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId: vehicle.id, processedAt: null },
    });
    expect(pending).toBeGreaterThan(0);

    crashApply.recoverPendingOutbox = orig;
    const recovery = await crashApply.recoverPendingOutbox(vehicle.id);
    expect(recovery.processed).toBeGreaterThan(0);
    const remaining = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId: vehicle.id, processedAt: null },
    });
    expect(remaining).toBe(0);
  });

  it('startup recovery drains outbox without new DTC ingress', async () => {
    const { org, vehicle, binding } = await fixture();
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T15:00:00Z'),
      auditRef: 'pg-startup-recovery',
      obdDtcListSignal: { timestamp: '2026-10-15T14:00:00Z', value: ['P0420'] },
    });

    const crashApply = makeApplyService();
    const noopFlush = async () => ({ processed: 0, failed: 0 });
    crashApply.recoverPendingOutbox = noopFlush;

    await crashApply.applyBuiltProposal(built);
    expect(
      await prisma.vehicleDtcSnapshotOutbox.count({
        where: { vehicleId: vehicle.id, processedAt: null },
      }),
    ).toBeGreaterThan(0);

    const restarted = makeApplyService();
    const recovery = await restarted.recoverPendingOutbox();
    expect(recovery.processed).toBeGreaterThan(0);
    expect(
      await prisma.vehicleDtcSnapshotOutbox.count({
        where: { vehicleId: vehicle.id, processedAt: null },
      }),
    ).toBe(0);
  });

  async function readDtcTruth(vehicleId: string) {
    const head = await prisma.vehicleDtcSourceHead.findUnique({
      where: { vehicleId },
    });
    const vls = await prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { obdDtcList: true },
    });
    const active = await prisma.vehicleDtcEvent.findMany({
      where: { vehicleId, isActive: true },
      select: { dtcCode: true, occurrenceCount: true },
      orderBy: { dtcCode: 'asc' },
    });
    const outbox = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId },
    });
    return { head, vls, active, outbox };
  }

  it('T100 complete → T200 partial → T150 defer → T250 clear (head, VLS, events agree)', async () => {
    const { org, vehicle, binding } = await fixture();
    const emptyHash = hashDtcCodesContent([]);
    const p0301Hash = hashDtcCodesContent(['P0301']);
    const ms = (n: number) => new Date(n).toISOString();

    const t100 = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date(110),
      auditRef: 'pg-timeline-t100',
      obdDtcListSignal: { timestamp: ms(100), value: [] },
    });
    const r100 = await apply.applyBuiltProposal(t100);
    expect(r100.decision.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT');
    let truth = await readDtcTruth(vehicle.id);
    expect(truth.head?.lastAcceptedCodesHash).toBe(emptyHash);
    expect(truth.head?.lastConfirmedCompleteSourceAt?.getTime()).toBe(100);
    expect(truth.head?.lastPartialWebhookSourceAt).toBeNull();
    expect(truth.vls?.obdDtcList).toEqual([]);
    expect(truth.active).toEqual([]);
    const outboxAfter100 = truth.outbox;

    const t200 = buildWebhookObdDtcProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date(210),
      auditRef: 'pg-timeline-t200',
      value: 'P0301',
      webhookTimestamp: ms(200),
    });
    const r200 = await apply.applyBuiltProposal(t200);
    expect(r200.decision.outcome).toBe('APPLY_WEBHOOK_PARTIAL');
    expect(r200.upserted).toEqual(['P0301']);
    truth = await readDtcTruth(vehicle.id);
    expect(truth.head?.lastAcceptedCodesHash).toBe(emptyHash);
    expect(truth.head?.lastPartialWebhookSourceAt?.getTime()).toBe(200);
    expect(truth.head?.lastPartialWebhookCodesHash).toBe(p0301Hash);
    expect(truth.vls?.obdDtcList).toEqual(['P0301']);
    expect(truth.active).toEqual([{ dtcCode: 'P0301', occurrenceCount: 1 }]);
    expect(truth.outbox).toBeGreaterThan(outboxAfter100);

    const t150 = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date(160),
      auditRef: 'pg-timeline-t150',
      obdDtcListSignal: { timestamp: ms(150), value: [] },
    });
    const r150 = await apply.applyBuiltProposal(t150);
    expect(r150.decision.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS');
    expect(r150.cleared).toEqual([]);
    truth = await readDtcTruth(vehicle.id);
    expect(truth.head?.lastAcceptedCodesHash).toBe(emptyHash);
    expect(truth.head?.lastConfirmedCompleteSourceAt?.getTime()).toBe(150);
    expect(truth.vls?.obdDtcList).toEqual(['P0301']);
    expect(truth.active).toEqual([{ dtcCode: 'P0301', occurrenceCount: 1 }]);

    const t250 = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date(260),
      auditRef: 'pg-timeline-t250',
      obdDtcListSignal: { timestamp: ms(250), value: [] },
    });
    const r250 = await apply.applyBuiltProposal(t250);
    expect(r250.decision.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT');
    expect(r250.cleared).toEqual(['P0301']);
    truth = await readDtcTruth(vehicle.id);
    expect(truth.head?.lastAcceptedCodesHash).toBe(emptyHash);
    expect(truth.head?.lastConfirmedCompleteSourceAt?.getTime()).toBe(250);
    expect(truth.vls?.obdDtcList).toEqual([]);
    expect(truth.active).toEqual([]);
    const clearedOnce = await prisma.vehicleDtcEvent.count({
      where: { vehicleId: vehicle.id, dtcCode: 'P0301', isActive: false },
    });
    expect(clearedOnce).toBe(1);
  });

  it('does not bump occurrence or outbox on newer timestamp with same active codes', async () => {
    const { org, vehicle, binding } = await fixture();
    const first = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T16:00:00Z'),
      auditRef: 'pg-watermark-1',
      obdDtcListSignal: { timestamp: '2026-10-15T15:00:00Z', value: ['P0301'] },
    });
    await apply.applyBuiltProposal(first);
    const eventAfterFirst = await prisma.vehicleDtcEvent.findFirst({
      where: { vehicleId: vehicle.id, dtcCode: 'P0301', isActive: true },
    });
    expect(eventAfterFirst?.occurrenceCount).toBe(1);
    const outboxAfterFirst = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId: vehicle.id },
    });

    const second = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T17:00:00Z'),
      auditRef: 'pg-watermark-2',
      obdDtcListSignal: { timestamp: '2026-10-15T16:00:00Z', value: ['P0301'] },
    });
    const result = await apply.applyBuiltProposal(second);
    expect(result.decision.outcome).toBe('REFRESH_SOURCE_WATERMARK');
    expect(result.upserted).toEqual([]);

    const eventAfterSecond = await prisma.vehicleDtcEvent.findFirst({
      where: { vehicleId: vehicle.id, dtcCode: 'P0301', isActive: true },
    });
    expect(eventAfterSecond?.id).toBe(eventAfterFirst?.id);
    expect(eventAfterSecond?.occurrenceCount).toBe(1);
    const outboxAfterSecond = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId: vehicle.id },
    });
    expect(outboxAfterSecond).toBe(outboxAfterFirst);
  });

  it('concurrent apply leaves a single channel head', async () => {
    const { org, vehicle, binding } = await fixture();
    const base = {
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: ['P0301'] },
    };
    const [r1, r2] = await Promise.all([
      apply.applyBuiltProposal(
        buildPollSignalsLatestProposal({ ...base, auditRef: 'pg-conc-a' }),
      ),
      apply.applyBuiltProposal(
        buildPollSignalsLatestProposal({ ...base, auditRef: 'pg-conc-b' }),
      ),
    ]);
    const applied = [r1, r2].filter((r) => r.decision.apply);
    expect(applied.length).toBe(1);
    const head = await prisma.vehicleDtcSourceHead.findUnique({
      where: { vehicleId: vehicle.id },
    });
    expect(head?.lastAcceptedCodesHash).toBe(hashDtcCodesContent(['P0301']));
  });
});
