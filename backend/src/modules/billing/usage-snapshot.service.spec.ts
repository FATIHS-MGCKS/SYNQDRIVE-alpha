import { ConflictException } from '@nestjs/common';
import {
  BillingUsageCalculationStatus,
  BillingUsageSnapshotBasis,
} from '@prisma/client';
import { UsageSnapshotService } from './usage-snapshot.service';

describe('UsageSnapshotService', () => {
  const orgId = 'org-1';
  const itemId = 'item-base';
  const period = {
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-01T00:00:00.000Z'),
    interval: 'MONTHLY' as const,
    anchorDay: 1,
    timezone: 'UTC',
    source: 'ANCHOR_CALENDAR' as const,
  };

  let snapshots: any[];
  let lockedUpdateAttempt: boolean;

  const prisma: any = {
    billingUsageSnapshot: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.idempotencyKey) {
          return snapshots.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return snapshots.find((row) => row.id === where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `snap-${snapshots.length + 1}`, createdAt: new Date(), ...data };
        snapshots.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = snapshots.find((item) => item.id === where.id);
        if (!row) return null;
        if (row.lockedAt) {
          lockedUpdateAttempt = true;
          throw new Error('locked_guard');
        }
        Object.assign(row, data);
        return row;
      }),
    },
    billingSubscriptionItem: {
      findFirst: jest.fn(async () => ({ id: itemId, subscriptionId: 'sub-1' })),
      findUnique: jest.fn(async () => ({ id: itemId, subscriptionId: 'sub-1' })),
    },
    billingBillableVehicleAssignment: {
      findMany: jest.fn(async () => [
        {
          id: 'asg-1',
          vehicleId: 'veh-1',
          billableFrom: period.periodStart,
          billableUntil: null,
          status: 'ACTIVE',
          reasonCode: null,
        },
      ]),
    },
    billingQuantityEvent: {
      findMany: jest.fn(async () => []),
    },
    organization: {
      findUnique: jest.fn(async () => ({ defaultVatRate: 19 })),
    },
  };

  const periodResolver = {
    resolveForOrganization: jest.fn(async () => period),
  };
  const quantityResolver = {
    resolveQuantity: jest.fn(async () => ({
      connectedVehicleCount: 1,
      billableVehicleCount: 1,
      billableVehicleIds: ['veh-1'],
      excludedVehicleIds: [],
    })),
    reconstructHistoricalQuantity: jest.fn(async () => 1),
  };
  const pricingResolver = {
    resolvePriceAssignment: jest.fn(async () => ({
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      subscriptionItemId: itemId,
    })),
  };
  const discountResolver = {
    resolveDiscounts: jest.fn(async () => []),
  };
  const priceResolution = {
    calculateVolumePriceForVersion: jest.fn(async () => ({
      calculationStatus: BillingUsageCalculationStatus.OK,
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      currency: 'EUR',
      pricingModel: 'VOLUME',
      tier: { id: 'tier-1' },
      tierLines: [],
      unitPriceCents: 3000,
      subtotalCents: 3000,
      totalCents: 3000,
    })),
  };
  const quantityLedger = {
    recordEvent: jest.fn(async () => ({ created: true, event: {} })),
  };

  let service: UsageSnapshotService;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshots = [];
    lockedUpdateAttempt = false;
    service = new UsageSnapshotService(
      prisma as never,
      periodResolver as never,
      quantityResolver as never,
      pricingResolver as never,
      discountResolver as never,
      priceResolution as never,
      quantityLedger as never,
    );
  });

  it('previews a snapshot with proration, price version and discount basis', async () => {
    const preview = await service.preview({ organizationId: orgId });

    expect(preview.period.periodStart).toEqual(period.periodStart);
    expect(preview.calculationBasis).toBe(BillingUsageSnapshotBasis.BILLABLE_VEHICLES);
    expect(preview.priceVersionId).toBe('ver-1');
    expect(preview.proration.lines).toHaveLength(1);
    expect(preview.sourceHash).toHaveLength(64);
  });

  it('creates and locks a snapshot with idempotency key', async () => {
    const result = await service.createSnapshot({
      organizationId: orgId,
      idempotencyKey: 'snap-july-2026',
      lock: true,
    });

    expect(result.created).toBe(true);
    expect(result.snapshot.lockedAt).toBeInstanceOf(Date);
    expect(result.snapshot.idempotencyKey).toBe('snap-july-2026');
    expect(result.snapshot.priceVersionId).toBe('ver-1');
    expect(result.snapshot.discountSnapshotJson).toBeTruthy();
    expect(result.snapshot.prorationDetailsJson).toBeTruthy();
    expect(quantityLedger.recordEvent).toHaveBeenCalled();
  });

  it('returns the existing snapshot for duplicate idempotency keys', async () => {
    await service.createSnapshot({
      organizationId: orgId,
      idempotencyKey: 'dup-key',
    });
    const duplicate = await service.createSnapshot({
      organizationId: orgId,
      idempotencyKey: 'dup-key',
    });

    expect(duplicate.created).toBe(false);
    expect(snapshots).toHaveLength(1);
  });

  it('locks an unlocked snapshot exactly once', async () => {
    const created = await service.createSnapshot({
      organizationId: orgId,
      idempotencyKey: 'lock-me',
      lock: false,
    });

    const locked = await service.lockSnapshot(created.snapshot.id, 'admin-1');
    expect(locked.lockedAt).toBeInstanceOf(Date);

    await expect(service.lockSnapshot(created.snapshot.id, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('never mutates a locked snapshot and returns a correction hint on drift', async () => {
    const created = await service.createSnapshot({
      organizationId: orgId,
      idempotencyKey: 'drift-key',
      lock: true,
    });

    await expect(
      prisma.billingUsageSnapshot.update({
        where: { id: created.snapshot.id },
        data: { subtotalCents: 999 },
      }),
    ).rejects.toThrow('locked_guard');

    quantityResolver.resolveQuantity.mockResolvedValueOnce({
      connectedVehicleCount: 2,
      billableVehicleCount: 2,
      billableVehicleIds: ['veh-1', 'veh-2'],
      excludedVehicleIds: [],
    });
    prisma.billingBillableVehicleAssignment.findMany.mockResolvedValueOnce([
      {
        id: 'asg-1',
        vehicleId: 'veh-1',
        billableFrom: period.periodStart,
        billableUntil: null,
        status: 'ACTIVE',
        reasonCode: null,
      },
      {
        id: 'asg-2',
        vehicleId: 'veh-2',
        billableFrom: period.periodStart,
        billableUntil: null,
        status: 'ACTIVE',
        reasonCode: null,
      },
    ]);

    const hint = await service.detectCorrectionHint(created.snapshot.id);
    expect(hint?.code).toBe('SNAPSHOT_SOURCE_DRIFT');
    expect(hint?.recommendation).toContain('supplemental snapshot');
    expect(lockedUpdateAttempt).toBe(true);
  });
});
