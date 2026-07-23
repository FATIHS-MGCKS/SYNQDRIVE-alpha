import { Injectable, Logger } from '@nestjs/common';
import {
  AuthorizationDecisionEventType,
  DataAuthorizationAuditEventKind,
  DataAuthorizationAuditRetentionClass,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { readAuthorizationDecisionConfig } from '../../authorization-decision-engine/authorization-decision.config';
import { AUTHORIZATION_DECISION_OUTCOME } from '../../authorization-decision-engine/authorization-decision.constants';
import type {
  AuthorizationDecisionEvaluatedRequest,
  AuthorizationDecisionResult,
} from '../../authorization-decision-engine/authorization-decision.types';
import { AUTHORIZATION_DECISION_ENGINE_VERSION } from '../../authorization-decision-engine/authorization-decision.constants';
import { POLICY_RESOLVER_VERSION } from '../../policy-resolver/policy-resolver.constants';
import {
  buildAuditIdempotencyKey,
  CRITICAL_LIFECYCLE_EVENTS,
} from './data-authorization-audit.constants';
import { DataAuthorizationAuditOutboxRepository } from './data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditOutboxProcessorService } from './data-authorization-audit-outbox.processor';
import {
  hashPolicyChecksum,
  pseudonymizeProcessorIdentity,
  pseudonymizeResourceReference,
} from './data-authorization-audit-sanitize.util';
import { mustAuditFully, shouldSampleAllow } from './data-authorization-audit-sampling';

export interface RecordAuthorizationDecisionAuditParams {
  request: AuthorizationDecisionEvaluatedRequest;
  result: AuthorizationDecisionResult;
}

export interface ListAuthorizationDecisionAuditParams {
  organizationId: string;
  eventType?: AuthorizationDecisionEventType;
  correlationId?: string;
  dataCategory?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class DataAuthorizationAuditService {
  private readonly logger = new Logger(DataAuthorizationAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: DataAuthorizationAuditOutboxRepository,
    private readonly outboxProcessor: DataAuthorizationAuditOutboxProcessorService,
  ) {}

  async recordAuthorizationDecision(
    params: RecordAuthorizationDecisionAuditParams,
  ): Promise<string | null> {
    const config = readAuthorizationDecisionConfig();
    const samplingInput = {
      decision: params.result.decision,
      dataCategory: params.request.dataCategory,
      action: params.request.action,
      reasonCode: params.result.reasonCode,
      allowSamplingRate: Number(process.env.DATA_AUTH_AUDIT_ALLOW_SAMPLE_RATE ?? 0),
    };

    if (shouldSampleAllow(samplingInput)) {
      return null;
    }

    const eventId = randomUUID();
    const matched = params.result.resolverResult?.matchedPolicy;
    const resourceRef = params.request.resourceId ?? params.request.vehicleId ?? params.request.customerId ?? params.request.bookingId ?? params.request.stationId;

    const payload = {
      id: eventId,
      organizationId: params.request.organizationId,
      processingActivityId: params.result.resolverResult?.processingActivity.entityId ?? null,
      enforcementPolicyId: params.result.matchedPolicyId,
      policyVersion: params.result.policyVersion,
      eventType: mapDecisionToEventType(params.result),
      pathId: matched?.id ?? null,
      dataCategory: params.request.dataCategory,
      processingPurpose: params.request.purpose,
      sourceSystem: params.request.sourceSystem,
      action: params.request.action,
      processorType: params.request.processorType,
      processorIdentity: pseudonymizeProcessorIdentity(params.request.processorIdentity),
      resourceType: params.request.resourceType,
      resourceReferenceHash: pseudonymizeResourceReference(
        params.request.organizationId,
        params.request.resourceType,
        resourceRef,
      ),
      actorType: params.request.actorType,
      actorId: params.request.actorId,
      reasonCode: params.result.reasonCode,
      correlationId: params.request.correlationId,
      evaluatedAt: params.result.evaluatedAt,
      policyChecksum: hashPolicyChecksum({
        policyId: params.result.matchedPolicyId,
        policyVersion: params.result.policyVersion,
        policyFamilyId: matched?.policyFamilyId,
      }),
      resolverVersion: params.result.resolverResult?.resolverVersion ?? POLICY_RESOLVER_VERSION,
      engineVersion: params.result.engineVersion ?? AUTHORIZATION_DECISION_ENGINE_VERSION,
      retentionClass: resolveRetentionClass(params.request.dataCategory, params.result.decision),
      sampled: false,
    };

    const idempotencyKey = buildAuditIdempotencyKey({
      eventKind: DataAuthorizationAuditEventKind.AUTHORIZATION_DECISION,
      organizationId: params.request.organizationId,
      correlationId: params.request.correlationId,
      suffix: `${params.result.decision}:${eventId}`,
    });

    const outbox = await this.outboxRepo.enqueue({
      organizationId: params.request.organizationId,
      idempotencyKey,
      eventKind: DataAuthorizationAuditEventKind.AUTHORIZATION_DECISION,
      correlationId: params.request.correlationId,
      payload,
    });

    const critical = mustAuditFully(samplingInput) || params.result.decision !== AUTHORIZATION_DECISION_OUTCOME.ALLOW;
    if (critical || config.auditEnabled) {
      const outcome = await this.outboxProcessor.processOutboxId(outbox.id);
      if (outcome === 'retry' || outcome === 'dead_letter') {
        throw new Error(`Critical audit delivery failed: ${outcome}`);
      }
      return eventId;
    }

    return eventId;
  }

  enqueueLifecycleAuditInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      entityType: string;
      entityId: string;
      eventType: string;
      correlationId?: string | null;
      actorUserId?: string | null;
      previousStatus?: string | null;
      newStatus: string;
    },
  ) {
    if (!CRITICAL_LIFECYCLE_EVENTS.has(params.eventType)) return Promise.resolve(null);

    const correlationId = params.correlationId ?? `${params.entityType}:${params.entityId}:${params.eventType}`;
    return this.outboxRepo.enqueueInTransaction(tx, {
      organizationId: params.organizationId,
      idempotencyKey: buildAuditIdempotencyKey({
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        organizationId: params.organizationId,
        correlationId,
      }),
      eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
      correlationId,
      payload: {
        entityType: params.entityType,
        entityId: params.entityId,
        eventType: params.eventType,
        actorUserId: params.actorUserId ?? null,
        previousStatus: params.previousStatus ?? null,
        newStatus: params.newStatus,
      },
    });
  }

  enqueueReviewDecisionAuditInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      cycleId: string;
      stepType: string;
      outcome: string;
      actorUserId: string;
      reason?: string | null;
      entityVersionNumber: number;
    },
  ) {
    const correlationId = `${params.cycleId}:${params.stepType}:${params.outcome}`;
    return this.outboxRepo.enqueueInTransaction(tx, {
      organizationId: params.organizationId,
      idempotencyKey: buildAuditIdempotencyKey({
        eventKind: DataAuthorizationAuditEventKind.REVIEW_DECISION,
        organizationId: params.organizationId,
        correlationId,
      }),
      eventKind: DataAuthorizationAuditEventKind.REVIEW_DECISION,
      correlationId,
      payload: {
        cycleId: params.cycleId,
        stepType: params.stepType,
        outcome: params.outcome,
        actorUserId: params.actorUserId,
        reason: params.reason?.trim() || null,
        entityVersionNumber: params.entityVersionNumber,
      },
    });
  }

  async listAuthorizationDecisions(params: ListAuthorizationDecisionAuditParams) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const rows = await this.prisma.authorizationDecisionEvent.findMany({
      where: {
        organizationId: params.organizationId,
        ...(params.eventType ? { eventType: params.eventType } : {}),
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(params.dataCategory ? { dataCategory: params.dataCategory as never } : {}),
        ...(params.from || params.to
          ? {
              createdAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
        ...(params.cursor ? { id: { lt: params.cursor } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async getOutboxBacklog(organizationId: string) {
    return this.outboxRepo.countBacklog(organizationId);
  }
}

function mapDecisionToEventType(
  result: AuthorizationDecisionResult,
): AuthorizationDecisionEventType {
  switch (result.decision) {
    case AUTHORIZATION_DECISION_OUTCOME.ALLOW:
      return AuthorizationDecisionEventType.ALLOW;
    case AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY:
      return AuthorizationDecisionEventType.SHADOW_WOULD_DENY;
    default:
      return AuthorizationDecisionEventType.DENY;
  }
}

function resolveRetentionClass(
  dataCategory: string,
  decision: string,
): DataAuthorizationAuditRetentionClass {
  if (decision === 'DENY' || decision === 'SHADOW_WOULD_DENY') {
    return DataAuthorizationAuditRetentionClass.EXTENDED;
  }
  if (['CUSTOMER_DATA', 'FINANCIAL_DATA', 'HEALTH_SIGNALS'].includes(dataCategory)) {
    return DataAuthorizationAuditRetentionClass.EXTENDED;
  }
  return DataAuthorizationAuditRetentionClass.STANDARD;
}
