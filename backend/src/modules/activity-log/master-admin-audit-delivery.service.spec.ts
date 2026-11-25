import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE } from './master-admin-audit-delivery.contract';

describe('MasterAdminAuditDeliveryService', () => {
  const prisma = {
    $transaction: jest.fn(),
  };
  const iamAuditOutbox = {
    findByIdempotencyKey: jest.fn(),
  };

  let service: MasterAdminAuditDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterAdminAuditDeliveryService(
      prisma as never,
      iamAuditOutbox as never,
    );
  });

  const baseInput = {
    auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
    actorUserId: 'actor-1',
    correlationId: 'corr-1',
    description: 'test',
    metadata: { targetUserId: 'target-1', sessionId: 's1', outcome: 'SUCCESS' },
  };

  it('returns DELIVERED when activity log persist succeeds', async () => {
    const tx = { activityLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) } };
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));

    const outcome = await service.deliver(baseInput, {
      idempotencyKey: 'idem-1',
      recoveryOrganizationId: 'org-1',
    });

    expect(outcome).toBe('DELIVERED');
    expect(iamAuditOutbox.findByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('enqueues IAM outbox when primary persist fails and recovery org is set', async () => {
    const tx = {
      activityLog: { create: jest.fn() },
      iamAuditOutbox: { create: jest.fn().mockResolvedValue({ id: 'out-1' }) },
    };
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw new Error('db_down');
      })
      .mockImplementationOnce(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));

    iamAuditOutbox.findByIdempotencyKey.mockResolvedValue(null);

    const outcome = await service.deliver(baseInput, {
      idempotencyKey: 'idem-2',
      recoveryOrganizationId: 'org-1',
    });

    expect(outcome).toBe('ENQUEUED_FOR_RECOVERY');
    expect(tx.iamAuditOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE,
          organizationId: 'org-1',
          idempotencyKey: 'idem-2',
        }),
      }),
    );
  });

  it('records FAILURE_RECORDED when primary fails and no recovery org', async () => {
    const tx = { activityLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) } };
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw new Error('db_down');
      })
      .mockImplementationOnce(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));

    const outcome = await service.deliver(baseInput, {
      idempotencyKey: 'idem-3',
      recoveryOrganizationId: null,
    });

    expect(outcome).toBe('FAILURE_RECORDED');
    expect(tx.activityLog.create).toHaveBeenCalled();
  });
});