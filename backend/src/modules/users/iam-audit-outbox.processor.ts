import { Injectable, Logger } from '@nestjs/common';
import { IamAuditOutboxStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { UserAccessAuditService, UserAccessAuditActionCode } from './user-access-audit.service';
import { IamAuditOutboxRepository } from './iam-audit-outbox.repository';
import { IAM_AUDIT_OUTBOX } from './iam-audit.constants';
import { IamAuditOutboxMetricsService } from './iam-audit-outbox.metrics';
import { scanIamAuditPayloadForSecrets } from './iam-audit-sanitize.util';

@Injectable()
export class IamAuditOutboxProcessorService {
  private readonly logger = new Logger(IamAuditOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: IamAuditOutboxRepository,
    private readonly userAudit: UserAccessAuditService,
    private readonly metrics: IamAuditOutboxMetricsService,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'processed' | 'retry' | 'dead_letter' | 'skipped' | 'duplicate'> {
    const existing = await this.prisma.iamAuditOutbox.findUnique({ where: { id: outboxId } });
    if (!existing) return 'skipped';
    if (existing.status === IamAuditOutboxStatus.PROCESSED) {
      this.metrics.record('duplicate', existing.eventType);
      return 'duplicate';
    }
    if (existing.status === IamAuditOutboxStatus.DEAD_LETTER) {
      return 'skipped';
    }

    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    try {
      const payload = claimed.payload as Record<string, unknown>;
      const secretViolations = scanIamAuditPayloadForSecrets({
        ...payload,
        beforeSummary: claimed.beforeSummary,
        afterSummary: claimed.afterSummary,
      });
      if (secretViolations.length > 0) {
        throw new Error(`Audit payload contains sensitive fields: ${secretViolations.join(', ')}`);
      }

      await this.userAudit.record({
        organizationId: claimed.organizationId,
        actorUserId: claimed.actorUserId ?? undefined,
        auditAction: claimed.eventType as UserAccessAuditActionCode,
        targetUserId: claimed.subjectUserId ?? undefined,
        targetInviteId:
          typeof payload.targetInviteId === 'string' ? payload.targetInviteId : undefined,
        targetRoleId:
          typeof payload.targetRoleId === 'string' ? payload.targetRoleId : undefined,
        description:
          typeof payload.description === 'string' ? payload.description : claimed.eventType,
        before: claimed.beforeSummary ? JSON.parse(claimed.beforeSummary) : undefined,
        after: claimed.afterSummary ? JSON.parse(claimed.afterSummary) : undefined,
        metadata:
          payload.metadata && typeof payload.metadata === 'object'
            ? (payload.metadata as Record<string, unknown>)
            : undefined,
        route: typeof payload.route === 'string' ? payload.route : undefined,
        ipAddress: typeof payload.ipAddress === 'string' ? payload.ipAddress : undefined,
        userAgent: typeof payload.userAgent === 'string' ? payload.userAgent : undefined,
        level:
          payload.level === 'WARN' || payload.level === 'CRITICAL'
            ? payload.level
            : undefined,
      });

      await this.outboxRepo.markProcessed(claimed.id);
      this.metrics.record('processed', claimed.eventType);
      return 'processed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (claimed.attempts >= IAM_AUDIT_OUTBOX.maxAttempts) {
        await this.outboxRepo.markDeadLetter(claimed.id, message);
        this.metrics.record('dead_letter', claimed.eventType);
        this.logger.error(`iam audit outbox dead-letter id=${claimed.id}: ${message}`);
        return 'dead_letter';
      }

      const retryAt = new Date(
        Date.now() +
          IAM_AUDIT_OUTBOX.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
      );
      await this.outboxRepo.markRetry(claimed.id, message, retryAt);
      this.metrics.record('retry', claimed.eventType);
      this.logger.warn(
        `iam audit outbox retry id=${claimed.id} attempts=${claimed.attempts} next=${retryAt.toISOString()}`,
      );
      return 'retry';
    }
  }

  async processDue(limit = IAM_AUDIT_OUTBOX.pollBatchSize): Promise<void> {
    const staleBefore = new Date(Date.now() - IAM_AUDIT_OUTBOX.staleProcessingMs);
    await this.outboxRepo.recoverStaleProcessing(staleBefore);

    const rows = await this.outboxRepo.findDueBatch(limit);
    for (const row of rows) {
      await this.processOutboxId(row.id);
    }
  }
}
