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

const LIVE = process.env.DTC_01B_PG_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('DTC snapshot apply (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let apply: DtcSnapshotApplyService;
  const orgIds: string[] = [];

  beforeAll(() => {
    assertDtc01bDisposablePostgresTarget();
    apply = new DtcSnapshotApplyService(prisma as never, new DtcService(prisma as never));
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

    const crashApply = new DtcSnapshotApplyService(prisma as never, new DtcService(prisma as never));
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

    const crashApply = new DtcSnapshotApplyService(prisma as never, new DtcService(prisma as never));
    const noopFlush = async () => ({ processed: 0, failed: 0 });
    crashApply.recoverPendingOutbox = noopFlush;

    await crashApply.applyBuiltProposal(built);
    expect(
      await prisma.vehicleDtcSnapshotOutbox.count({
        where: { vehicleId: vehicle.id, processedAt: null },
      }),
    ).toBeGreaterThan(0);

    const restarted = new DtcSnapshotApplyService(prisma as never, new DtcService(prisma as never));
    const recovery = await restarted.recoverPendingOutbox();
    expect(recovery.processed).toBeGreaterThan(0);
    expect(
      await prisma.vehicleDtcSnapshotOutbox.count({
        where: { vehicleId: vehicle.id, processedAt: null },
      }),
    ).toBe(0);
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
