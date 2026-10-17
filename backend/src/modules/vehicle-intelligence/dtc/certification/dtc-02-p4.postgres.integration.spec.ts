/**
 * DTC-02 P4 source-trust reconciliation (disposable PostgreSQL).
 * DTC_01B_PG_INTEGRATION=1 DATABASE_URL=postgresql://…/dtc01b_test_… npm test -- dtc-02-p4.postgres
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DtcSnapshotApplyService } from '../snapshot/dtc-snapshot-apply.service';
import { DtcService } from '../dtc.service';
import {
  buildPollSignalsLatestProposal,
  buildWebhookObdDtcProposal,
} from '../snapshot/dtc-snapshot-proposal.builder';
import { assertDtc01bDisposablePostgresTarget } from '../snapshot/dtc-01b-postgres-guard';
import { insertDimoMirrorForPostgresTests } from '../../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { assessDtc02SourceTrustSurface } from './dtc-02-source-trust-reconciliation';
import { DTC02_OPERATIONAL_STALE_MS } from '../adaptive/dtc-02-adaptive-planner.constants';
import type { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { flushDtcSnapshotOutbox } from '../snapshot/dtc-snapshot-outbox.flush';

const LIVE = process.env.DTC_01B_PG_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('DTC-02 P4 source-trust reconciliation (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const orgIds: string[] = [];
  const pgNotificationIngest = {
    ingestVehicleHealthSources: async () => undefined,
  } as unknown as NotificationProducerIngestService;

  let apply: DtcSnapshotApplyService;

  beforeAll(() => {
    assertDtc01bDisposablePostgresTarget();
    apply = new DtcSnapshotApplyService(
      prisma as never,
      new DtcService(prisma as never),
      pgNotificationIngest,
    );
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

  async function fixture() {
    const org = await prisma.organization.create({
      data: {
        companyName: `dtc02-p4-${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgIds.push(org.id);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${Date.now()}`,
      tokenId: 52001,
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        licensePlate: 'DTC-P4',
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
        rawPayloadJson: {},
      },
    });
    return {
      org,
      vehicle,
      binding: {
        provider: 'DIMO' as const,
        providerBindingId: link.id,
        dimoTokenId: 52001,
      },
    };
  }

  async function readSurface(vehicleId: string, evaluatedAtMs: number) {
    const head = await prisma.vehicleDtcSourceHead.findUnique({ where: { vehicleId } });
    const vls = await prisma.vehicleLatestState.findUnique({ where: { vehicleId } });
    const active = await prisma.vehicleDtcEvent.findMany({
      where: { vehicleId, isActive: true },
      select: { dtcCode: true },
    });
    const outboxPending = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId, processedAt: null },
    });
    return assessDtc02SourceTrustSurface({
      hasSourceHead: head != null,
      headLastPollFetchAtMs: head?.lastPollFetchAt?.getTime() ?? null,
      vlsLastDtcPollAtMs: vls?.lastDtcPollAt?.getTime() ?? null,
      vlsLastSuccessfulCheckAtMs: vls?.lastDtcSuccessfulCheckAt?.getTime() ?? null,
      lastConfirmedCompleteSourceAtMs: head?.lastConfirmedCompleteSourceAt?.getTime() ?? null,
      lastPartialWebhookSourceAtMs: head?.lastPartialWebhookSourceAt?.getTime() ?? null,
      activeDtcCodes: new Set(active.map((e) => e.dtcCode)),
      vlsObdDtcList: (vls?.obdDtcList as string[] | null) ?? null,
      outboxPendingCount: outboxPending,
      evaluatedAtMs,
      operationalStaleMs: DTC02_OPERATIONAL_STALE_MS,
    });
  }

  it('missing source-head before first apply', async () => {
    const { vehicle } = await fixture();
    const r = await readSurface(vehicle.id, Date.now());
    expect(r.divergences).toContain('MISSING_SOURCE_HEAD');
    expect(r.blocksFutureDeferral).toBe(true);
  });

  it('head and VLS poll timestamps align after apply', async () => {
    const { org, vehicle, binding } = await fixture();
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'p4-align',
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: ['P0301'] },
    });
    await apply.applyBuiltProposal(built);
    const r = await readSurface(vehicle.id, Date.parse('2026-10-15T12:00:00Z'));
    expect(r.divergences).toContain('ALIGNED');
  });

  it('delayed outbox eventually drains without duplicate episodes', async () => {
    const { org, vehicle, binding } = await fixture();
    const built = buildPollSignalsLatestProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T14:00:00Z'),
      auditRef: 'p4-outbox',
      obdDtcListSignal: { timestamp: '2026-10-15T13:00:00Z', value: ['P0301'] },
    });
    const crashApply = new DtcSnapshotApplyService(
      prisma as never,
      new DtcService(prisma as never),
      pgNotificationIngest,
    );
    crashApply.recoverPendingOutbox = async () => ({ processed: 0, failed: 0 });
    await crashApply.applyBuiltProposal(built);
    const pending = await prisma.vehicleDtcSnapshotOutbox.count({
      where: { vehicleId: vehicle.id, processedAt: null },
    });
    expect(pending).toBeGreaterThan(0);
    const recovery = await flushDtcSnapshotOutbox({
      prisma: prisma as never,
      dtcService: new DtcService(prisma as never),
      notificationIngest: pgNotificationIngest,
      vehicleId: vehicle.id,
    });
    expect(recovery.processed).toBeGreaterThan(0);
    const event = await prisma.vehicleDtcEvent.findFirst({
      where: { vehicleId: vehicle.id, dtcCode: 'P0301', isActive: true },
    });
    expect(event?.occurrenceCount).toBe(1);
  });

  it('partial webhook after complete leaves divergence class partial-after-complete', async () => {
    const { org, vehicle, binding } = await fixture();
    await apply.applyBuiltProposal(
      buildPollSignalsLatestProposal({
        vehicleId: vehicle.id,
        organizationId: org.id,
        binding,
        fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
        auditRef: 'p4-complete',
        obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: [] },
      }),
    );
    await apply.applyBuiltProposal(
      buildWebhookObdDtcProposal({
        vehicleId: vehicle.id,
        organizationId: org.id,
        binding,
        fetchObservedAt: new Date('2026-10-15T13:00:00Z'),
        auditRef: 'p4-partial',
        value: 'P0420',
        webhookTimestamp: '2026-10-15T12:30:00Z',
      }),
    );
    const r = await readSurface(vehicle.id, Date.parse('2026-10-15T13:00:00Z'));
    expect(r.divergences).toContain('PARTIAL_AFTER_COMPLETE');
  });
});
