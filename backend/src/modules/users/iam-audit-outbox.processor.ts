import { Injectable, Logger } from '@nestjs/common';
import { IamAuditOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { IamAuditOutboxRepository } from './iam-audit-outbox.repository';

@Injectable()
export class IamAuditOutboxProcessorService {
  private readonly logger = new Logger(IamAuditOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: IamAuditOutboxRepository,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  async processOutboxId(outboxId: string): Promise<'processed' | 'dead_letter' | 'skipped'> {
    const row = await this.prisma.iamAuditOutbox.findUnique({ where: { id: outboxId } });
    if (!row || row.status !== IamAuditOutboxStatus.PENDING) return 'skipped';

    try {
      const payload = row.payload as Record<string, unknown>;
      await this.userAudit.record({
        organizationId: row.organizationId,
        actorUserId: typeof payload.actorUserId === 'string' ? payload.actorUserId : undefined,
        auditAction: row.auditAction as never,
        targetUserId: typeof payload.targetUserId === 'string' ? payload.targetUserId : undefined,
        targetInviteId: typeof payload.targetInviteId === 'string' ? payload.targetInviteId : undefined,
        targetRoleId: typeof payload.targetRoleId === 'string' ? payload.targetRoleId : undefined,
        description: typeof payload.description === 'string' ? payload.description : row.auditAction,
        before: payload.before,
        after: payload.after,
        metadata:
          payload.metadata && typeof payload.metadata === 'object'
            ? (payload.metadata as Record<string, unknown>)
            : undefined,
        level:
          payload.level === 'WARN' || payload.level === 'CRITICAL' ? payload.level : undefined,
      });
      await this.outboxRepo.markProcessed(row.id);
      return 'processed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.outboxRepo.markDeadLetter(row.id, message);
      this.logger.error(`iam audit outbox dead-letter id=${row.id}: ${message}`);
      return 'dead_letter';
    }
  }

  async processPending(limit = 25): Promise<void> {
    const rows = await this.outboxRepo.findPendingBatch(limit);
    for (const row of rows) {
      await this.processOutboxId(row.id);
    }
  }
}
