/**
 * PostgreSQL integration for DTC-01B snapshot apply.
 * Run: DTC_01B_PG_INTEGRATION=1 DATABASE_URL=postgresql://.../dtc01b_test_xxx npm test -- dtc-01b.postgres
 */
import { PrismaClient } from '@prisma/client';
import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { DtcService } from '../dtc.service';
import { buildPollSignalsLatestProposal, buildWebhookObdDtcProposal } from './dtc-snapshot-proposal.builder';
import { assertDtc01bDisposablePostgresTarget } from './dtc-01b-postgres-guard';

const LIVE = process.env.DTC_01B_PG_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('DTC-01B snapshot apply (PostgreSQL)', () => {
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
      await prisma.vehicleDtcSourceHead.deleteMany({
        where: { organizationId: orgId },
      });
      await prisma.vehicleDtcEvent.deleteMany({
        where: { vehicle: { organizationId: orgId } },
      });
      await prisma.vehicleLatestState.deleteMany({
        where: { vehicle: { organizationId: orgId } },
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
        companyName: `dtc01b-${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    orgIds.push(org.id);
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        licensePlate: 'DTC-01B',
        make: 'VW',
        model: 'Golf',
        year: 2024,
        fuelType: 'PETROL',
        status: 'AVAILABLE',
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
    return { org, vehicle };
  }

  const binding = {
    provider: 'DIMO' as const,
    providerBindingId: 'link-1',
    dimoTokenId: 42,
  };

  it('does not overwrite global VLS provenance on apply', async () => {
    const { org, vehicle } = await fixture();
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
    expect(vls?.syncJobRef).toBe('other-module');
    expect(vls?.obdDtcList).toEqual(['P0301']);
    const head = await prisma.vehicleDtcSourceHead.findUnique({
      where: { vehicleId: vehicle.id },
    });
    expect(head?.providerBindingId).toBe('link-1');
  });

  it('rejects partial invalid payload without clear', async () => {
    const { org, vehicle } = await fixture();
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
      obdDtcListSignal: { timestamp: '2026-10-15T11:30:00Z', value: ['bad-code'] },
    });
    expect(built.ok).toBe(false);
    const active = await prisma.vehicleDtcEvent.count({
      where: { vehicleId: vehicle.id, isActive: true },
    });
    expect(active).toBe(1);
  });

  it('webhook partial does not set lastDtcSuccessfulCheckAt', async () => {
    const { org, vehicle } = await fixture();
    const built = buildWebhookObdDtcProposal({
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'pg-wh',
      value: 'P0420',
      webhookTimestamp: '2026-10-15T11:00:00Z',
    });
    await apply.applyBuiltProposal(built);
    const vls = await prisma.vehicleLatestState.findUnique({
      where: { vehicleId: vehicle.id },
    });
    expect(vls?.lastDtcSuccessfulCheckAt).toBeNull();
  });

  it('concurrent apply: one wins, other noop or reject without corrupt head', async () => {
    const { org, vehicle } = await fixture();
    const base = {
      vehicleId: vehicle.id,
      organizationId: org.id,
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: ['P0301'] },
    };
    const b1 = buildPollSignalsLatestProposal({ ...base, auditRef: 'pg-conc-a' });
    const b2 = buildPollSignalsLatestProposal({ ...base, auditRef: 'pg-conc-b' });
    const [r1, r2] = await Promise.all([
      apply.applyBuiltProposal(b1),
      apply.applyBuiltProposal(b2),
    ]);
    const applied = [r1, r2].filter((r) => r.decision.apply);
    expect(applied.length).toBe(1);
    const head = await prisma.vehicleDtcSourceHead.findUnique({
      where: { vehicleId: vehicle.id },
    });
    expect(head?.lastAcceptedCodesHash).toBeTruthy();
  });
});
