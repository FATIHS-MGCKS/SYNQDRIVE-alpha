import { ConflictException } from '@nestjs/common';
import { BillingCommandStatus } from '@prisma/client';
import { BillingCommandService } from './billing-command.service';
import { BillingCommandErrorCode, BillingCommandType, hashBillingCommandRequest } from './domain/billing-command';

describe('BillingCommandService', () => {
  const orgId = 'org-1';
  const idempotencyKey = 'idem-activate';

  let commands: any[];
  let auditLogs: any[];
  let outbox: any[];
  let txShouldFail: boolean;

  const prisma: any = {
    billingCommand: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) {
          return commands.find((row) => row.id === where.id) ?? null;
        }
        const key = where.organizationId_idempotencyKey;
        return (
          commands.find(
            (row) =>
              row.organizationId === key.organizationId &&
              row.idempotencyKey === key.idempotencyKey,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `cmd-${commands.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        commands.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = commands.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matches = commands.filter(
          (row) => row.id === where.id && (!where.status || row.status === where.status),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = commands.find((item) => item.id === where.id);
        if (!row) throw new Error('missing command');
        return row;
      }),
    },
    billingAuditLog: {
      create: jest.fn(async ({ data }: any) => {
        auditLogs.push(data);
        return { id: `audit-${auditLogs.length}`, ...data };
      }),
    },
    billingDomainEventOutbox: {
      create: jest.fn(async ({ data }: any) => {
        outbox.push(data);
        return { id: `outbox-${outbox.length}`, ...data };
      }),
    },
    $transaction: jest.fn(async (fn: any) => {
      if (txShouldFail) {
        throw new Error('tx_failed');
      }
      return fn(prisma);
    }),
  };

  const audit = {
    logInTransaction: jest.fn(async (tx: any, input: any) => tx.billingAuditLog.create({ data: input })),
  };
  const outboxService = {
    enqueue: jest.fn(async (tx: any, input: any) => tx.billingDomainEventOutbox.create({ data: input })),
  };

  let service: BillingCommandService;
  let handlerCalls: number;

  const actor = { actorUserId: 'master-1', idempotencyKey, requestId: 'req-1' };
  const payload = { priceVersionId: 'ver-1', lockVersion: 1 };

  beforeEach(() => {
    jest.clearAllMocks();
    commands = [];
    auditLogs = [];
    outbox = [];
    handlerCalls = 0;
    txShouldFail = false;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      if (txShouldFail) {
        throw new Error('tx_failed');
      }
      return fn(prisma);
    });
    service = new BillingCommandService(prisma as never, audit as never, outboxService as never);
  });

  const execute = () =>
    service.execute({
      organizationId: orgId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
      actor,
      payload,
      aggregateId: 'sub-1',
      audit: {
        action: 'MASTER_SUBSCRIPTION_ACTIVATED',
        entityType: 'BillingSubscription',
        changedFields: ['status'],
      },
      handler: async () => {
        handlerCalls += 1;
        return {
          result: { organizationId: orgId, contract: { status: 'ACTIVE' } },
          aggregateId: 'sub-1',
          resultReference: 'sub-1',
        };
      },
    });

  it('replays duplicate same request with same result', async () => {
    const first = await execute();
    const second = await execute();

    expect(first.created).toBe(true);
    expect(first.replayed).toBe(false);
    expect(second.created).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(handlerCalls).toBe(1);
  });

  it('rejects same idempotency key with different payload', async () => {
    await execute();

    await expect(
      service.execute({
        organizationId: orgId,
        commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
        actor,
        payload: { priceVersionId: 'ver-2', lockVersion: 1 },
        audit: {
          action: 'MASTER_SUBSCRIPTION_ACTIVATED',
          entityType: 'BillingSubscription',
        },
        handler: async () => ({
          result: { organizationId: orgId },
        }),
      }),
    ).rejects.toMatchObject({
      response: { code: BillingCommandErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH },
    });
  });

  it('persists audit and outbox when finalizing command', async () => {
    await execute();

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'MASTER_SUBSCRIPTION_ACTIVATED',
      idempotencyKey,
      requestId: 'req-1',
      changedFields: ['status'],
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].eventType).toBe('billing.subscription.status_changed');
    expect(commands[0].status).toBe(BillingCommandStatus.COMPLETED);
  });

  it('marks command failed when handler throws before finalize', async () => {
    await expect(
      service.execute({
        organizationId: orgId,
        commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
        actor: { ...actor, idempotencyKey: 'idem-fail' },
        payload,
        audit: {
          action: 'MASTER_SUBSCRIPTION_ACTIVATED',
          entityType: 'BillingSubscription',
        },
        handler: async () => {
          throw new Error('handler_failed');
        },
      }),
    ).rejects.toThrow('handler_failed');

    const failed = commands.find((row) => row.idempotencyKey === 'idem-fail');
    expect(failed?.status).toBe(BillingCommandStatus.FAILED);
    expect(auditLogs).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });

  describe('finalize transaction failures', () => {
    afterEach(() => {
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    });

    it('rolls back finalize audit and outbox when finalize transaction fails', async () => {
      await execute();
      const initialAuditCount = auditLogs.length;
      const initialOutboxCount = outbox.length;

      let txCalls = 0;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        txCalls += 1;
        if (txCalls > 1) {
          throw new Error('finalize_tx_failed');
        }
        return fn(prisma);
      });

      commands.push({
        id: 'cmd-retry',
        organizationId: orgId,
        idempotencyKey: 'idem-retry',
        requestHash: hashBillingCommandRequest(payload),
        status: BillingCommandStatus.FAILED,
      });

      await expect(
        service.execute({
          organizationId: orgId,
          commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
          actor: { ...actor, idempotencyKey: 'idem-retry' },
          payload,
          audit: {
            action: 'MASTER_SUBSCRIPTION_ACTIVATED',
            entityType: 'BillingSubscription',
          },
          handler: async () => ({
            result: { organizationId: orgId, contract: { status: 'ACTIVE' } },
          }),
        }),
      ).rejects.toThrow('finalize_tx_failed');

      expect(auditLogs).toHaveLength(initialAuditCount);
      expect(outbox).toHaveLength(initialOutboxCount);
    });
  });

  it('blocks parallel duplicate command while processing', async () => {
    commands.push({
      id: 'cmd-processing',
      organizationId: orgId,
      idempotencyKey,
      requestHash: hashBillingCommandRequest(payload),
      status: BillingCommandStatus.PROCESSING,
    });

    await expect(execute()).rejects.toMatchObject({
      response: { code: BillingCommandErrorCode.CONCURRENT_COMMAND_IN_PROGRESS },
    });
  });

  it('allows safe retry after failed command with same payload', async () => {
    commands.push({
      id: 'cmd-failed',
      organizationId: orgId,
      idempotencyKey,
      requestHash: hashBillingCommandRequest(payload),
      status: BillingCommandStatus.FAILED,
      resultJson: null,
    });

    const retried = await execute();
    expect(retried.created).toBe(false);
    expect(retried.replayed).toBe(false);
    expect(handlerCalls).toBe(1);
    expect(commands[0].status).toBe(BillingCommandStatus.COMPLETED);
  });
});

describe('BillingCommandService parallel lifecycle commands', () => {
  const orgId = 'org-parallel';
  let subscriptions: any[];
  let commands: any[];
  let auditLogs: any[];
  let outbox: any[];

  const prisma: any = {
    billingCommand: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return commands.find((row) => row.id === where.id) ?? null;
        const key = where.organizationId_idempotencyKey;
        return (
          commands.find(
            (row) =>
              row.organizationId === key.organizationId &&
              row.idempotencyKey === key.idempotencyKey,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `cmd-${commands.length + 1}`, ...data };
        commands.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = commands.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = commands.find((item) => item.id === where.id && item.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = commands.find((item) => item.id === where.id);
        if (!row) throw new Error('missing');
        return row;
      }),
    },
    billingAuditLog: { create: jest.fn(async ({ data }: any) => { auditLogs.push(data); return data; }) },
    billingDomainEventOutbox: { create: jest.fn(async ({ data }: any) => { outbox.push(data); return data; }) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const service = new BillingCommandService(
    prisma as never,
    { logInTransaction: jest.fn(async (tx: any, input: any) => tx.billingAuditLog.create({ data: input })) } as never,
    { enqueue: jest.fn(async (tx: any, input: any) => tx.billingDomainEventOutbox.create({ data: input })) } as never,
  );

  beforeEach(() => {
    subscriptions = [{ id: 'sub-1', organizationId: orgId, lockVersion: 0 }];
    commands = [];
    auditLogs = [];
    outbox = [];
    jest.clearAllMocks();
  });

  const activate = (idempotencyKey: string, lockVersion: number) =>
    service.execute({
      organizationId: orgId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
      actor: { actorUserId: 'master-1', idempotencyKey },
      payload: { priceVersionId: 'ver-1', lockVersion },
      audit: { action: 'MASTER_SUBSCRIPTION_ACTIVATED', entityType: 'BillingSubscription' },
      handler: async () => {
        const sub = subscriptions[0];
        if (sub.lockVersion !== lockVersion) {
          throw new ConflictException({ code: 'OPTIMISTIC_LOCK_FAILED' });
        }
        sub.lockVersion += 1;
        return {
          result: { organizationId: orgId, contract: { status: 'ACTIVE', lockVersion: sub.lockVersion } },
          aggregateId: sub.id,
        };
      },
    });

  const scheduleTariff = (idempotencyKey: string, lockVersion: number) =>
    service.execute({
      organizationId: orgId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_SCHEDULE_TARIFF_CHANGE,
      actor: { actorUserId: 'master-1', idempotencyKey },
      payload: { productKey: 'FLEET', effectiveAt: '2026-09-01T00:00:00.000Z', lockVersion },
      audit: { action: 'MASTER_SUBSCRIPTION_TARIFF_CHANGE_SCHEDULED', entityType: 'BillingSubscription' },
      handler: async () => {
        const sub = subscriptions[0];
        if (sub.lockVersion !== lockVersion) {
          throw new ConflictException({ code: 'OPTIMISTIC_LOCK_FAILED' });
        }
        sub.lockVersion += 1;
        return {
          result: { organizationId: orgId, contract: { scheduledProductKey: 'FLEET' } },
          aggregateId: sub.id,
        };
      },
    });

  it('serializes parallel activation via optimistic lock so only one succeeds', async () => {
    const results = await Promise.allSettled([
      activate('idem-a', 0),
      activate('idem-b', 0),
    ]);

    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(subscriptions[0].lockVersion).toBe(1);
    expect(commands.filter((row) => row.status === 'COMPLETED')).toHaveLength(1);
    expect(commands.filter((row) => row.status === 'FAILED')).toHaveLength(1);
  });

  it('serializes parallel tariff changes with distinct idempotency keys', async () => {
  subscriptions[0].lockVersion = 1;
    const results = await Promise.allSettled([
      scheduleTariff('tariff-a', 1),
      scheduleTariff('tariff-b', 1),
    ]);

    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(subscriptions[0].lockVersion).toBe(2);
  });
});
