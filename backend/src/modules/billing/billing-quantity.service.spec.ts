import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingQuantityEventSource, BillingQuantityEventType } from '@prisma/client';
import { BillingQuantityService } from './billing-quantity.service';

describe('BillingQuantityService', () => {
  const orgId = 'org-1';
  const subscriptionId = 'sub-1';
  const subscriptionItemId = 'item-base';

  const baseItem = {
    id: subscriptionItemId,
    organizationId: orgId,
    subscriptionId,
    quantity: 0,
  };

  let events: Array<Record<string, unknown>>;
  let itemQuantity: number;
  let prisma: any;
  let service: BillingQuantityService;
  let transactionChain: Promise<unknown>;

  const sortEvents = () =>
    [...events].sort((a, b) => {
      const eff =
        (a.effectiveAt as Date).getTime() - (b.effectiveAt as Date).getTime();
      if (eff !== 0) return eff;
      return (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime();
    });

  const buildPrismaMock = () => {
    events = [];
    itemQuantity = 0;
    transactionChain = Promise.resolve();

    prisma = {
      billingQuantityEvent: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
          events.find((event) => event.idempotencyKey === where.idempotencyKey) ?? null,
        ),
        findMany: jest.fn(async ({ where }: { where?: { subscriptionItemId?: string } } = {}) => {
          const filtered = where?.subscriptionItemId
            ? events.filter((event) => event.subscriptionItemId === where.subscriptionItemId)
            : events;
          return sortEvents().filter((event) => filtered.includes(event));
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `evt-${events.length + 1}`, ...data };
          events.push(row);
          return row;
        }),
      },
      billingSubscriptionItem: {
        findUnique: jest.fn(async () => baseItem),
        update: jest.fn(async ({ data }: { data: { quantity: number } }) => {
          itemQuantity = data.quantity;
          return { ...baseItem, quantity: itemQuantity };
        }),
      },
      billingSubscription: {
        findUnique: jest.fn(async () => ({ organizationId: orgId })),
      },
      vehicle: {
        findUnique: jest.fn(async () => ({ organizationId: orgId })),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const run = transactionChain.then(() => fn(prisma));
        transactionChain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
      $executeRaw: jest.fn(),
    };
  };

  beforeEach(() => {
    buildPrismaMock();
    service = new BillingQuantityService(prisma as never);
  });

  const recordAdd = (overrides: Record<string, unknown> = {}) =>
    service.recordVehicleLicenseAdded({
      organizationId: orgId,
      subscriptionId,
      subscriptionItemId,
      vehicleId: 'veh-1',
      idempotencyKey: 'add-1',
      ...overrides,
    });

  it('records vehicle license added with before/after quantities', async () => {
    const result = await recordAdd();

    expect(result.created).toBe(true);
    expect(result.event.quantityBefore).toBe(0);
    expect(result.event.quantityAfter).toBe(1);
    expect(result.event.eventType).toBe(BillingQuantityEventType.VEHICLE_CONNECTED);
    expect(itemQuantity).toBe(1);
  });

  it('is idempotent for duplicate event id', async () => {
    await recordAdd();
    const duplicate = await recordAdd();

    expect(duplicate.created).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('rejects events that would make quantity negative', async () => {
    await expect(
      service.recordVehicleLicenseRemoved({
        organizationId: orgId,
        subscriptionId,
        subscriptionItemId,
        vehicleId: 'veh-1',
        idempotencyKey: 'remove-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires authorization for retroactive events', async () => {
    await expect(
      recordAdd({
        effectiveAt: new Date('2026-06-01'),
        recordedAt: new Date('2026-07-01'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records retroactive events when explicitly authorized', async () => {
    const result = await recordAdd({
      effectiveAt: new Date('2026-06-01'),
      recordedAt: new Date('2026-07-01'),
      retroactiveAuthorized: true,
      idempotencyKey: 'retro-1',
    });

    expect(result.created).toBe(true);
    expect(result.event.effectiveAt.toISOString()).toContain('2026-06-01');
  });

  it('reconstructs historical quantity at a point in time', async () => {
    const julyEffective = new Date('2026-07-01T12:00:00.000Z');
    const augustEffective = new Date('2026-08-01T12:00:00.000Z');

    await recordAdd({
      idempotencyKey: 'add-a',
      vehicleId: 'veh-a',
      effectiveAt: julyEffective,
      recordedAt: julyEffective,
    });
    await service.recordVehicleLicenseAdded({
      organizationId: orgId,
      subscriptionId,
      subscriptionItemId,
      vehicleId: 'veh-b',
      effectiveAt: augustEffective,
      recordedAt: augustEffective,
      idempotencyKey: 'add-b',
    });

    const julyQty = await service.reconstructQuantity(
      subscriptionItemId,
      new Date('2026-07-15'),
    );
    const septemberQty = await service.reconstructQuantity(
      subscriptionItemId,
      new Date('2026-09-01'),
    );

    expect(julyQty).toBe(1);
    expect(septemberQty).toBe(2);
  });

  it('rejects cross-tenant vehicle references', async () => {
    prisma.vehicle.findUnique.mockResolvedValueOnce({ organizationId: 'org-2' });

    await expect(recordAdd()).rejects.toBeInstanceOf(ConflictException);
  });

  it('records exclusion activated and lifted as delta events', async () => {
    await recordAdd({ idempotencyKey: 'base-add' });

    const excluded = await service.recordExclusionActivated({
      organizationId: orgId,
      subscriptionId,
      subscriptionItemId,
      vehicleId: 'veh-1',
      idempotencyKey: 'excl-on',
      actorUserId: 'admin-1',
      reason: 'Approved exclusion',
    });

    expect(excluded.event.quantityAfter).toBe(0);

    const included = await service.recordExclusionLifted({
      organizationId: orgId,
      subscriptionId,
      subscriptionItemId,
      vehicleId: 'veh-1',
      idempotencyKey: 'excl-off',
      actorUserId: 'admin-1',
      reason: 'Exclusion lifted',
    });

    expect(included.event.quantityAfter).toBe(1);
  });

  it('handles parallel adds with transaction lock calls', async () => {
    await Promise.all([
      recordAdd({ idempotencyKey: 'parallel-1', vehicleId: 'veh-1' }),
      recordAdd({ idempotencyKey: 'parallel-2', vehicleId: 'veh-2' }),
    ]);

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(events).toHaveLength(2);
    expect(itemQuantity).toBe(2);
  });
});
