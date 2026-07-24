import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AuthorizationActorType,
  AuthorizationDecisionEventType,
  DataAuthorizationAuditEventKind,
  DataAuthorizationAuditOutboxStatus,
  DataAuthorizationAuditRetentionClass,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { validateAuthorizationDecisionEvent } from '../privacy-domain.invariants';
import {
  DATA_AUTHORIZATION_AUDIT_OUTBOX,
} from './data-authorization-audit.constants';
import { DataAuthorizationAuditOutboxRepository } from './data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditOutboxMetricsService } from './data-authorization-audit-outbox.metrics';
import { DataAuthMetricsService } from '../../observability/data-auth-metrics.service';

@Injectable()
export class DataAuthorizationAuditOutboxProcessorService {
  private readonly logger = new Logger(DataAuthorizationAuditOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: DataAuthorizationAuditOutboxRepository,
    private readonly metrics: DataAuthorizationAuditOutboxMetricsService,
    @Optional() private readonly prometheusMetrics?: DataAuthMetricsService,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'processed' | 'retry' | 'dead_letter' | 'skipped' | 'duplicate'> {
    const existing = await this.prisma.dataAuthorizationAuditOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!existing) return 'skipped';
    if (existing.status === DataAuthorizationAuditOutboxStatus.PROCESSED) {
      this.metrics.record('duplicate', existing.eventKind);
      return 'duplicate';
    }
    if (existing.status === DataAuthorizationAuditOutboxStatus.DEAD_LETTER) return 'skipped';

    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) return 'skipped';

    try {
      await this.materializeEvent(claimed.organizationId, claimed.eventKind, claimed.payload as Record<string, unknown>);
      await this.outboxRepo.markProcessed(claimed.id);
      this.metrics.record('processed', claimed.eventKind);
      return 'processed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (claimed.attempts >= DATA_AUTHORIZATION_AUDIT_OUTBOX.maxAttempts) {
        await this.outboxRepo.markDeadLetter(claimed.id, message);
        this.metrics.record('dead_letter', claimed.eventKind);
        this.prometheusMetrics?.recordAuditDeadLetter(claimed.eventKind);
        this.logger.error(`data-auth audit outbox dead-letter id=${claimed.id}: ${message}`);
        return 'dead_letter';
      }
      const retryAt = new Date(
        Date.now() +
          DATA_AUTHORIZATION_AUDIT_OUTBOX.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
      );
      await this.outboxRepo.markRetry(claimed.id, message, retryAt);
      this.metrics.record('retry', claimed.eventKind);
      this.prometheusMetrics?.recordAuditOutboxFailed(claimed.eventKind);
      return 'retry';
    }
  }

  async processDue(limit = DATA_AUTHORIZATION_AUDIT_OUTBOX.pollBatchSize): Promise<void> {
    const staleBefore = new Date(Date.now() - DATA_AUTHORIZATION_AUDIT_OUTBOX.staleProcessingMs);
    await this.outboxRepo.recoverStaleProcessing(staleBefore);
    const rows = await this.outboxRepo.findDueBatch(limit);
    for (const row of rows) {
      await this.processOutboxId(row.id);
    }
  }

  private async materializeEvent(
    organizationId: string,
    eventKind: DataAuthorizationAuditEventKind,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (eventKind) {
      case DataAuthorizationAuditEventKind.AUTHORIZATION_DECISION:
        await this.writeAuthorizationDecisionEvent(organizationId, payload);
        break;
      case DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE:
        // Lifecycle events are written in-transaction; outbox confirms durability marker only.
        break;
      case DataAuthorizationAuditEventKind.REVIEW_DECISION:
        // Review decisions are append-only in data_processing_review_decisions.
        break;
      default:
        throw new Error(`Unknown audit event kind: ${eventKind}`);
    }
  }

  private async writeAuthorizationDecisionEvent(
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    validateAuthorizationDecisionEvent({
      organizationId,
      processingActivityOrganizationId: (payload.processingActivityId as string) ? organizationId : organizationId,
      enforcementPolicyOrganizationId: (payload.enforcementPolicyId as string) ? organizationId : organizationId,
    });

    const eventType = payload.eventType as AuthorizationDecisionEventType;
    const id = (payload.id as string) ?? randomUUID();

    await this.prisma.authorizationDecisionEvent.create({
      data: {
        id,
        organizationId,
        processingActivityId: (payload.processingActivityId as string) ?? null,
        enforcementPolicyId: (payload.enforcementPolicyId as string) ?? null,
        policyVersion: (payload.policyVersion as number) ?? null,
        eventType,
        pathId: (payload.pathId as string) ?? null,
        dataCategory: payload.dataCategory as never,
        processingPurpose: payload.processingPurpose as never,
        sourceSystem: (payload.sourceSystem as string) ?? null,
        action: (payload.action as string) ?? null,
        processorType: (payload.processorType as string) ?? null,
        processorIdentity: (payload.processorIdentity as string) ?? null,
        resourceType: (payload.resourceType as string) ?? null,
        resourceReferenceHash: (payload.resourceReferenceHash as string) ?? null,
        vehicleId: null,
        actorType: (payload.actorType as AuthorizationActorType) ?? AuthorizationActorType.SYSTEM,
        actorId: (payload.actorId as string) ?? null,
        decisionReason: (payload.reasonCode as string) ?? null,
        correlationId: (payload.correlationId as string) ?? null,
        evaluatedAt: payload.evaluatedAt ? new Date(payload.evaluatedAt as string) : null,
        policyChecksum: (payload.policyChecksum as string) ?? null,
        resolverVersion: (payload.resolverVersion as string) ?? null,
        engineVersion: (payload.engineVersion as string) ?? null,
        retentionClass:
          (payload.retentionClass as DataAuthorizationAuditRetentionClass) ??
          DataAuthorizationAuditRetentionClass.STANDARD,
        sampled: Boolean(payload.sampled),
      },
    }).catch((error) => {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') return;
      throw error;
    });
  }
}
