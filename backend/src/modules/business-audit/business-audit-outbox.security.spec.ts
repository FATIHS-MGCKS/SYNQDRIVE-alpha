import { BusinessAuditOutboxStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { BusinessAuditOutboxRepository } from './business-audit-outbox.repository';
import { BusinessAuditOutboxProcessorService } from './business-audit-outbox.processor';
import { BusinessAuditOutboxMetricsService } from './business-audit-outbox.metrics';
import { BusinessAuditService } from './business-audit.service';
import { BusinessAuditAction } from './business-audit.constants';
import {
  hashBusinessAuditValue,
  sanitizeBusinessAuditValue,
  scanBusinessAuditPayloadForSecrets,
} from './business-audit-sanitize.util';
import { buildBusinessAuditIdempotencyKey } from './business-audit-idempotency.util';

describe('business audit outbox', () => {
  describe('sanitizeBusinessAuditValue', () => {
    it('masks sensitive document and token fields', () => {
      const sanitized = sanitizeBusinessAuditValue({
        document: { extractedJson: { licenseNumber: 'X' } },
        token: 'super-secret-token',
        status: 'PENDING',
      }) as Record<string, unknown>;

      expect(sanitized.document).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.status).toBe('PENDING');
    });

    it('reports sensitive payload violations during scan', () => {
      const violations = scanBusinessAuditPayloadForSecrets({
        metadata: { password: 'leaked' },
      });
      expect(violations).toContain('metadata.password');
    });
  });

  describe('buildBusinessAuditIdempotencyKey', () => {
    it('builds stable tenant-scoped keys', () => {
      const key = buildBusinessAuditIdempotencyKey({
        action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
        organizationId: 'org-a',
        entityType: 'RENTAL_RULE_REVISION',
        entityId: 'rev-1',
        correlationId: 'publish:rev-1:2',
      });

      expect(key).toBe(
        'business-audit:org-a:RENTAL_RULE_PUBLISHED:RENTAL_RULE_REVISION:rev-1:publish:rev-1:2',
      );
    });
  });

  describe('BusinessAuditOutboxRepository', () => {
    it('stores hashed summaries instead of raw secrets', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'outbox-1' });
      const tx = { businessAuditOutbox: { create } };
      const repo = new BusinessAuditOutboxRepository({} as never);

      await repo.enqueueInTransaction(tx as never, {
        organizationId: 'org-a',
        idempotencyKey: 'key-1',
        action: BusinessAuditAction.RENTAL_RULE_DRAFT_CREATED,
        entityType: 'RENTAL_RULE_REVISION',
        entityId: 'rev-1',
        description: 'draft created',
        before: { document: { extractedJson: { secret: 'value' } } },
        after: { status: 'DRAFT' },
      });

      const data = create.mock.calls[0][0].data;
      expect(data.beforeSummary).not.toContain('value');
      expect(data.beforeHash).toBe(
        hashBusinessAuditValue({ document: '[REDACTED]' }),
      );
      expect(data.afterSummary).toContain('DRAFT');
    });

    it('returns existing row on duplicate idempotency key', async () => {
      const existing = { id: 'outbox-existing' };
      const create = jest
        .fn()
        .mockRejectedValue({ code: 'P2002', clientVersion: 'test' });
      const findUnique = jest.fn().mockResolvedValue(existing);
      const tx = { businessAuditOutbox: { create, findUnique } };
      const repo = new BusinessAuditOutboxRepository({} as never);

      const result = await repo.enqueueInTransaction(tx as never, {
        organizationId: 'org-a',
        idempotencyKey: 'key-dup',
        action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
        entityType: 'BOOKING_ELIGIBILITY_APPROVAL',
        entityId: 'approval-1',
        description: 'requested',
      });

      expect(result).toBe(existing);
    });
  });

  describe('BusinessAuditOutboxProcessorService', () => {
    const baseRow = {
      id: 'outbox-1',
      eventId: 'event-1',
      organizationId: 'org-a',
      idempotencyKey: 'key-1',
      actorUserId: 'actor-1',
      action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
      entityType: 'RENTAL_RULE_REVISION',
      entityId: 'rev-1',
      correlationId: 'publish:rev-1:1',
      occurredAt: new Date(),
      payloadVersion: 1,
      beforeHash: null,
      beforeSummary: null,
      afterHash: 'hash-after',
      afterSummary: JSON.stringify({ status: 'ACTIVE' }),
      changeReason: 'policy update',
      outcome: 'published',
      diffRef: JSON.stringify({ changedRules: [] }),
      payload: {
        description: 'published',
        metadata: null,
      },
      status: BusinessAuditOutboxStatus.PENDING,
      attempts: 0,
      nextRetryAt: new Date(),
      processedAt: null,
      deadLetteredAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let prisma: { businessAuditOutbox: { findUnique: jest.Mock } };
    let outboxRepo: {
      claimForProcessing: jest.Mock;
      markProcessed: jest.Mock;
      markRetry: jest.Mock;
      markDeadLetter: jest.Mock;
    };
    let auditService: { record: jest.Mock };
    let metrics: BusinessAuditOutboxMetricsService;
    let processor: BusinessAuditOutboxProcessorService;

    beforeEach(() => {
      prisma = {
        businessAuditOutbox: {
          findUnique: jest.fn().mockResolvedValue(baseRow),
        },
      };
      outboxRepo = {
        claimForProcessing: jest.fn().mockResolvedValue({ ...baseRow, attempts: 1 }),
        markProcessed: jest.fn().mockResolvedValue(undefined),
        markRetry: jest.fn().mockResolvedValue(undefined),
        markDeadLetter: jest.fn().mockResolvedValue(undefined),
      };
      auditService = { record: jest.fn().mockResolvedValue('log-1') };
      metrics = new BusinessAuditOutboxMetricsService();
      processor = new BusinessAuditOutboxProcessorService(
        prisma as never,
        outboxRepo as unknown as BusinessAuditOutboxRepository,
        auditService as unknown as AuditService,
        metrics,
      );
    });

    it('processes a claimed outbox row into append-only activity log', async () => {
      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('processed');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorOrganizationId: 'org-a',
          entityId: 'rev-1',
          metaJson: expect.objectContaining({
            businessAudit: expect.objectContaining({
              action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
              correlationId: 'publish:rev-1:1',
            }),
          }),
        }),
      );
      expect(outboxRepo.markProcessed).toHaveBeenCalledWith('outbox-1');
      expect(metrics.snapshot()['processed:RENTAL_RULE_PUBLISHED']).toBe(1);
    });

    it('schedules retry when worker fails', async () => {
      auditService.record.mockRejectedValueOnce(new Error('audit sink unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('retry');
      expect(outboxRepo.markRetry).toHaveBeenCalled();
      expect(metrics.snapshot()['retry:RENTAL_RULE_PUBLISHED']).toBe(1);
    });

    it('dead-letters after max attempts', async () => {
      outboxRepo.claimForProcessing.mockResolvedValue({
        ...baseRow,
        attempts: 5,
      });
      auditService.record.mockRejectedValueOnce(new Error('audit sink unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('dead_letter');
      expect(outboxRepo.markDeadLetter).toHaveBeenCalled();
      expect(metrics.snapshot()['dead_letter:RENTAL_RULE_PUBLISHED']).toBe(1);
    });

    it('treats already processed rows as duplicate', async () => {
      prisma.businessAuditOutbox.findUnique.mockResolvedValue({
        ...baseRow,
        status: BusinessAuditOutboxStatus.PROCESSED,
      });

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('duplicate');
      expect(outboxRepo.claimForProcessing).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });

  describe('BusinessAuditService.flushCritical', () => {
    it('throws when outbox ends in dead letter', async () => {
      const processor = {
        processOutboxId: jest.fn().mockResolvedValue('dead_letter'),
      };
      const outboxRepo = {
        findById: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          status: BusinessAuditOutboxStatus.DEAD_LETTER,
        }),
      };
      const service = new BusinessAuditService(
        outboxRepo as unknown as BusinessAuditOutboxRepository,
        processor as unknown as BusinessAuditOutboxProcessorService,
      );

      await expect(service.flushCritical(['outbox-1'])).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'BUSINESS_AUDIT_OUTBOX_DEAD_LETTER',
        }),
      });
    });

    it('succeeds when outbox is processed', async () => {
      const processor = {
        processOutboxId: jest.fn().mockResolvedValue('processed'),
      };
      const outboxRepo = {
        findById: jest.fn(),
      };
      const service = new BusinessAuditService(
        outboxRepo as unknown as BusinessAuditOutboxRepository,
        processor as unknown as BusinessAuditOutboxProcessorService,
      );

      await expect(service.flushCritical(['outbox-1'])).resolves.toBeUndefined();
    });
  });
});
