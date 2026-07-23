import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity, BusinessAuditOutboxStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BUSINESS_AUDIT_ENTITY_TYPE,
  BUSINESS_AUDIT_OUTBOX,
  BusinessAuditAction,
  type BusinessAuditActionCode,
  type BusinessAuditEntityType,
} from './business-audit.constants';
import { BusinessAuditOutboxRepository } from './business-audit-outbox.repository';
import { BusinessAuditOutboxMetricsService } from './business-audit-outbox.metrics';
import { scanBusinessAuditPayloadForSecrets } from './business-audit-sanitize.util';

@Injectable()
export class BusinessAuditOutboxProcessorService {
  private readonly logger = new Logger(BusinessAuditOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: BusinessAuditOutboxRepository,
    private readonly auditService: AuditService,
    private readonly metrics: BusinessAuditOutboxMetricsService,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'processed' | 'retry' | 'dead_letter' | 'skipped' | 'duplicate'> {
    const existing = await this.prisma.businessAuditOutbox.findUnique({ where: { id: outboxId } });
    if (!existing) return 'skipped';
    if (existing.status === BusinessAuditOutboxStatus.PROCESSED) {
      this.metrics.record('duplicate', existing.action);
      return 'duplicate';
    }
    if (existing.status === BusinessAuditOutboxStatus.DEAD_LETTER) {
      return 'skipped';
    }

    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    try {
      const payload = claimed.payload as Record<string, unknown>;
      const secretViolations = scanBusinessAuditPayloadForSecrets({
        ...payload,
        beforeSummary: claimed.beforeSummary,
        afterSummary: claimed.afterSummary,
        diffRef: claimed.diffRef,
        changeReason: claimed.changeReason,
      });
      if (secretViolations.length > 0) {
        throw new Error(`Audit payload contains sensitive fields: ${secretViolations.join(', ')}`);
      }

      const metadata = (payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {}) as Record<string, unknown>;

      await this.auditService.record({
        actorUserId: claimed.actorUserId ?? undefined,
        actorOrganizationId: claimed.organizationId,
        action: this.mapActivityAction(claimed.action as BusinessAuditActionCode),
        entity: this.mapActivityEntity(claimed.entityType as BusinessAuditEntityType),
        entityId: claimed.entityId,
        description:
          typeof payload.description === 'string' ? payload.description : claimed.action,
        changeSummary: claimed.diffRef ?? undefined,
        level: this.resolveLevel(claimed.action as BusinessAuditActionCode),
        metaJson: {
          businessAudit: {
            eventId: claimed.eventId,
            action: claimed.action,
            entityType: claimed.entityType,
            correlationId: claimed.correlationId,
            occurredAt: claimed.occurredAt.toISOString(),
            beforeHash: claimed.beforeHash,
            afterHash: claimed.afterHash,
            changeReason: claimed.changeReason,
            outcome: claimed.outcome,
            diffRef: claimed.diffRef,
          },
          ...metadata,
        },
      });

      await this.outboxRepo.markProcessed(claimed.id);
      this.metrics.record('processed', claimed.action);
      return 'processed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (claimed.attempts >= BUSINESS_AUDIT_OUTBOX.maxAttempts) {
        await this.outboxRepo.markDeadLetter(claimed.id, message);
        this.metrics.record('dead_letter', claimed.action);
        this.logger.error(`business audit outbox dead-letter id=${claimed.id}: ${message}`);
        return 'dead_letter';
      }

      const retryAt = new Date(
        Date.now() +
          BUSINESS_AUDIT_OUTBOX.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
      );
      await this.outboxRepo.markRetry(claimed.id, message, retryAt);
      this.metrics.record('retry', claimed.action);
      this.logger.warn(
        `business audit outbox retry id=${claimed.id} attempts=${claimed.attempts} next=${retryAt.toISOString()}`,
      );
      return 'retry';
    }
  }

  async processDue(limit = BUSINESS_AUDIT_OUTBOX.pollBatchSize): Promise<void> {
    const staleBefore = new Date(Date.now() - BUSINESS_AUDIT_OUTBOX.staleProcessingMs);
    await this.outboxRepo.recoverStaleProcessing(staleBefore);

    const rows = await this.outboxRepo.findDueBatch(limit);
    for (const row of rows) {
      await this.processOutboxId(row.id);
    }
  }

  private mapActivityAction(action: BusinessAuditActionCode): ActivityAction {
    switch (action) {
      case BusinessAuditAction.RENTAL_RULE_DRAFT_CREATED:
      case BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_CREATED:
      case BusinessAuditAction.MANUAL_APPROVAL_REQUESTED:
        return ActivityAction.CREATE;
      case BusinessAuditAction.RENTAL_VEHICLE_OVERRIDE_DELETED:
        return ActivityAction.DELETE;
      default:
        return ActivityAction.UPDATE;
    }
  }

  private mapActivityEntity(entityType: BusinessAuditEntityType): ActivityEntity {
    switch (entityType) {
      case BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE:
        return ActivityEntity.VEHICLE;
      case BUSINESS_AUDIT_ENTITY_TYPE.BOOKING:
      case BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL:
        return ActivityEntity.BOOKING;
      default:
        return ActivityEntity.ORGANIZATION;
    }
  }

  private resolveLevel(action: BusinessAuditActionCode): 'INFO' | 'WARN' | 'CRITICAL' {
    switch (action) {
      case BusinessAuditAction.RENTAL_RULE_PUBLISHED:
      case BusinessAuditAction.RENTAL_RULE_DEACTIVATED:
      case BusinessAuditAction.MANUAL_APPROVAL_APPROVED:
      case BusinessAuditAction.MANUAL_APPROVAL_REJECTED:
      case BusinessAuditAction.MANUAL_APPROVAL_REVOKED:
        return 'CRITICAL';
      case BusinessAuditAction.MANUAL_APPROVAL_REQUESTED:
      case BusinessAuditAction.MANUAL_APPROVAL_EXPIRED:
        return 'WARN';
      default:
        return 'INFO';
    }
  }
}
