import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';

describe('MasterAdminAuditDeliveryService', () => {
  const prisma = { $transaction: jest.fn() };
  const outboxRepo = { enqueueInTransaction: jest.fn(), findById: jest.fn() };
  const outboxProcessor = { deliverAtomic: jest.fn() };

  let service: MasterAdminAuditDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterAdminAuditDeliveryService(
      prisma as never,
      outboxRepo as never,
      outboxProcessor as never,
    );
  });

  const baseInput = {
    auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
    actorUserId: 'actor-1',
    correlationId: 'corr-1',
    description: 'test',
    metadata: { targetUserId: 'target-1', sessionId: 's1', outcome: 'SUCCESS' },
  };

  it('returns DELIVERED when outbox intent and atomic delivery succeed', async () => {
    outboxRepo.enqueueInTransaction.mockResolvedValue({ id: 'outbox-1' });
    outboxRepo.findById.mockResolvedValue({
      id: 'outbox-1',
      status: 'PENDING',
      idempotencyKey: 'idem-1',
      occurredAt: new Date(),
      payload: { masterAdminAuditEnvelope: baseInput },
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
    outboxProcessor.deliverAtomic.mockResolvedValue('delivered');

    const outcome = await service.commitAuditIntent(baseInput, {
      idempotencyKey: 'idem-1',
      organizationContextId: null,
    });

    expect(outcome).toBe('DELIVERED');
  });

  it('returns INTENT_PERSISTED when delivery fails after durable enqueue', async () => {
    outboxRepo.enqueueInTransaction.mockResolvedValue({ id: 'outbox-1' });
    outboxRepo.findById.mockResolvedValue({
      id: 'outbox-1',
      status: 'PENDING',
      idempotencyKey: 'idem-2',
      occurredAt: new Date(),
      payload: { masterAdminAuditEnvelope: baseInput },
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
    outboxProcessor.deliverAtomic.mockRejectedValue(new Error('db_down'));

    const outcome = await service.commitAuditIntent(baseInput, {
      idempotencyKey: 'idem-2',
      organizationContextId: null,
    });

    expect(outcome).toBe('INTENT_PERSISTED');
  });
});