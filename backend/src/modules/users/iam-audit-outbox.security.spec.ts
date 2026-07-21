import { IamAuditOutboxStatus } from '@prisma/client';
import { IamAuditOutboxRepository } from './iam-audit-outbox.repository';
import { IamAuditOutboxProcessorService } from './iam-audit-outbox.processor';
import { IamAuditOutboxMetricsService } from './iam-audit-outbox.metrics';
import { UserAccessAuditService, UserAccessAuditAction } from './user-access-audit.service';
import { IAM_AUDIT_OUTBOX } from './iam-audit.constants';
import {
  hashIamAuditValue,
  sanitizeIamAuditValue,
  scanIamAuditPayloadForSecrets,
} from './iam-audit-sanitize.util';

describe('iam audit outbox', () => {
  describe('sanitizeIamAuditValue', () => {
    it('masks password hashes, tokens, and emails', () => {
      const sanitized = sanitizeIamAuditValue({
        passwordHash: 'bcrypt$2b$10$abcdefghijklmnopqrstuvwxyz',
        token: 'super-secret-invite-token-value',
        email: 'user@example.com',
        role: 'WORKER',
      }) as Record<string, unknown>;

      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(String(sanitized.email)).toContain('@example.com');
      expect(sanitized.role).toBe('WORKER');
    });

    it('reports sensitive payload violations during scan', () => {
      const violations = scanIamAuditPayloadForSecrets({
        metadata: { passwordHash: 'leaked' },
      });
      expect(violations).toContain('metadata.passwordHash');
    });
  });

  describe('IamAuditOutboxRepository', () => {
    it('stores hashed summaries instead of raw secrets', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'outbox-1' });
      const tx = { iamAuditOutbox: { create } };
      const repo = new IamAuditOutboxRepository({} as never);

      await repo.enqueueInTransaction(tx as never, {
        organizationId: 'org-a',
        idempotencyKey: 'key-1',
        eventType: UserAccessAuditAction.USER_CREATED,
        subjectUserId: 'user-1',
        description: 'created',
        before: { passwordHash: 'secret' },
        after: { role: 'WORKER' },
      });

      const data = create.mock.calls[0][0].data;
      expect(data.beforeSummary).not.toContain('secret');
      expect(data.beforeHash).toBe(hashIamAuditValue({ passwordHash: '[REDACTED]' }));
      expect(data.afterSummary).toContain('WORKER');
    });
  });

  describe('IamAuditOutboxProcessorService', () => {
    const baseRow = {
      id: 'outbox-1',
      eventId: 'event-1',
      organizationId: 'org-a',
      idempotencyKey: 'key-1',
      actorUserId: 'actor-1',
      subjectUserId: 'user-1',
      membershipId: 'mem-1',
      eventType: UserAccessAuditAction.USER_DEACTIVATED,
      occurredAt: new Date(),
      payloadVersion: 1,
      beforeHash: null,
      beforeSummary: null,
      afterHash: null,
      afterSummary: JSON.stringify({ status: 'SUSPENDED' }),
      reason: null,
      payload: {
        description: 'deactivated',
        targetInviteId: null,
        targetRoleId: null,
        route: null,
        ipAddress: null,
        userAgent: null,
        level: 'WARN',
        metadata: null,
      },
      status: IamAuditOutboxStatus.PENDING,
      attempts: 0,
      nextRetryAt: new Date(),
      processedAt: null,
      deadLetteredAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let prisma: { iamAuditOutbox: { findUnique: jest.Mock } };
    let outboxRepo: {
      claimForProcessing: jest.Mock;
      markProcessed: jest.Mock;
      markRetry: jest.Mock;
      markDeadLetter: jest.Mock;
    };
    let userAudit: { record: jest.Mock };
    let metrics: IamAuditOutboxMetricsService;
    let processor: IamAuditOutboxProcessorService;

    beforeEach(() => {
      prisma = {
        iamAuditOutbox: {
          findUnique: jest.fn().mockResolvedValue(baseRow),
        },
      };
      outboxRepo = {
        claimForProcessing: jest.fn().mockResolvedValue({ ...baseRow, attempts: 1 }),
        markProcessed: jest.fn().mockResolvedValue(undefined),
        markRetry: jest.fn().mockResolvedValue(undefined),
        markDeadLetter: jest.fn().mockResolvedValue(undefined),
      };
      userAudit = { record: jest.fn().mockResolvedValue(undefined) };
      metrics = new IamAuditOutboxMetricsService();
      processor = new IamAuditOutboxProcessorService(
        prisma as never,
        outboxRepo as unknown as IamAuditOutboxRepository,
        userAudit as unknown as UserAccessAuditService,
        metrics,
      );
    });

    it('processes a claimed outbox row into append-only activity log', async () => {
      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('processed');
      expect(userAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-a',
          auditAction: UserAccessAuditAction.USER_DEACTIVATED,
          targetUserId: 'user-1',
        }),
      );
      expect(outboxRepo.markProcessed).toHaveBeenCalledWith('outbox-1');
      expect(metrics.snapshot()['processed:USER_DEACTIVATED']).toBe(1);
    });

    it('schedules retry when worker fails', async () => {
      userAudit.record.mockRejectedValueOnce(new Error('audit sink unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('retry');
      expect(outboxRepo.markRetry).toHaveBeenCalled();
      expect(metrics.snapshot()['retry:USER_DEACTIVATED']).toBe(1);
    });

    it('dead-letters after max attempts', async () => {
      outboxRepo.claimForProcessing.mockResolvedValue({
        ...baseRow,
        attempts: IAM_AUDIT_OUTBOX.maxAttempts,
      });
      userAudit.record.mockRejectedValueOnce(new Error('audit sink unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('dead_letter');
      expect(outboxRepo.markDeadLetter).toHaveBeenCalled();
      expect(metrics.snapshot()['dead_letter:USER_DEACTIVATED']).toBe(1);
    });

    it('treats already processed rows as duplicate', async () => {
      prisma.iamAuditOutbox.findUnique.mockResolvedValue({
        ...baseRow,
        status: IamAuditOutboxStatus.PROCESSED,
      });

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('duplicate');
      expect(outboxRepo.claimForProcessing).not.toHaveBeenCalled();
      expect(userAudit.record).not.toHaveBeenCalled();
    });

    it('rejects payloads that still contain sensitive values', async () => {
      outboxRepo.claimForProcessing.mockResolvedValue({
        ...baseRow,
        attempts: 1,
        payload: {
          ...baseRow.payload,
          metadata: { passwordHash: 'leaked' },
        },
      });

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('retry');
      expect(userAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('transactional mutation + outbox', () => {
    it('rolls back outbox when membership mutation fails', async () => {
      const tx = {
        organizationMembership: {
          update: jest.fn().mockRejectedValue(new Error('db failure')),
        },
        iamAuditOutbox: {
          create: jest.fn(),
        },
      };

      await expect(
        (async () => {
          await tx.organizationMembership.update({ where: { id: 'mem-1' }, data: {} });
          await tx.iamAuditOutbox.create({ data: { id: 'outbox-1' } });
        })(),
      ).rejects.toThrow('db failure');

      expect(tx.iamAuditOutbox.create).not.toHaveBeenCalled();
    });
  });

  describe('cross-tenant isolation', () => {
    it('scopes repository reads by organization when provided', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const repo = new IamAuditOutboxRepository({
        iamAuditOutbox: { findFirst },
      } as never);

      await repo.findById('outbox-1', 'org-b');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'outbox-1', organizationId: 'org-b' },
      });
    });
  });
});
