import { Injectable } from '@nestjs/common';
import {
  AuthorizationActorType,
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DataAuthorizationAuditService } from '../audit-log/data-authorization-audit.service';

export interface PolicyLifecycleActorInput {
  actorUserId?: string | null;
  actorType?: AuthorizationActorType;
  reason?: string | null;
  supersededById?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  correlationId?: string | null;
}

export interface PolicyLifecycleEventInput extends PolicyLifecycleActorInput {
  organizationId: string;
}

export interface RecordPolicyLifecycleEventParams extends PolicyLifecycleEventInput {
  eventType: PrivacyPolicyLifecycleEventType;
  previousStatus: PrivacyPolicyLifecycleStatus | null;
  newStatus: PrivacyPolicyLifecycleStatus;
}

@Injectable()
export class PolicyLifecycleEventsService {
  constructor(private readonly audit: DataAuthorizationAuditService) {}

  async recordProcessingActivityEvent(
    tx: Prisma.TransactionClient,
    processingActivityId: string,
    params: RecordPolicyLifecycleEventParams,
  ): Promise<void> {
    await tx.processingActivityLifecycleEvent.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        processingActivityId,
        eventType: params.eventType,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        actorUserId: params.actorUserId ?? null,
        actorType: params.actorType ?? AuthorizationActorType.SYSTEM,
        reason: params.reason?.trim() || null,
        supersededById: params.supersededById ?? null,
        validFrom: params.validFrom ?? null,
        validUntil: params.validUntil ?? null,
        correlationId: params.correlationId ?? null,
      },
    });

    await this.audit.enqueueLifecycleAuditInTransaction(tx, {
      organizationId: params.organizationId,
      entityType: 'PROCESSING_ACTIVITY',
      entityId: processingActivityId,
      eventType: params.eventType,
      correlationId: params.correlationId,
      actorUserId: params.actorUserId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    });
  }

  async recordLegalBasisAssessmentEvent(
    tx: Prisma.TransactionClient,
    legalBasisAssessmentId: string,
    params: RecordPolicyLifecycleEventParams,
  ): Promise<void> {
    await tx.legalBasisAssessmentLifecycleEvent.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        legalBasisAssessmentId,
        eventType: params.eventType,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        actorUserId: params.actorUserId ?? null,
        actorType: params.actorType ?? AuthorizationActorType.SYSTEM,
        reason: params.reason?.trim() || null,
        supersededById: params.supersededById ?? null,
        validFrom: params.validFrom ?? null,
        validUntil: params.validUntil ?? null,
        correlationId: params.correlationId ?? null,
      },
    });

    await this.audit.enqueueLifecycleAuditInTransaction(tx, {
      organizationId: params.organizationId,
      entityType: 'LEGAL_BASIS_ASSESSMENT',
      entityId: legalBasisAssessmentId,
      eventType: params.eventType,
      correlationId: params.correlationId,
      actorUserId: params.actorUserId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    });
  }

  async recordEnforcementPolicyEvent(
    tx: Prisma.TransactionClient,
    enforcementPolicyId: string,
    params: RecordPolicyLifecycleEventParams,
  ): Promise<void> {
    await tx.enforcementPolicyLifecycleEvent.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        enforcementPolicyId,
        eventType: params.eventType,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        actorUserId: params.actorUserId ?? null,
        actorType: params.actorType ?? AuthorizationActorType.SYSTEM,
        reason: params.reason?.trim() || null,
        supersededById: params.supersededById ?? null,
        validFrom: params.validFrom ?? null,
        validUntil: params.validUntil ?? null,
        correlationId: params.correlationId ?? null,
      },
    });

    await this.audit.enqueueLifecycleAuditInTransaction(tx, {
      organizationId: params.organizationId,
      entityType: 'ENFORCEMENT_POLICY',
      entityId: enforcementPolicyId,
      eventType: params.eventType,
      correlationId: params.correlationId,
      actorUserId: params.actorUserId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    });
  }
}

export function mapTransitionToEventType(
  from: PrivacyPolicyLifecycleStatus | null,
  to: PrivacyPolicyLifecycleStatus,
): PrivacyPolicyLifecycleEventType {
  switch (to) {
    case PrivacyPolicyLifecycleStatus.IN_REVIEW:
      return PrivacyPolicyLifecycleEventType.SUBMITTED_FOR_REVIEW;
    case PrivacyPolicyLifecycleStatus.DRAFT:
      return from === PrivacyPolicyLifecycleStatus.IN_REVIEW
        ? PrivacyPolicyLifecycleEventType.REQUESTED_CHANGES
        : PrivacyPolicyLifecycleEventType.VERSION_CREATED;
    case PrivacyPolicyLifecycleStatus.APPROVED:
      return PrivacyPolicyLifecycleEventType.APPROVED;
    case PrivacyPolicyLifecycleStatus.REJECTED:
      return PrivacyPolicyLifecycleEventType.REJECTED;
    case PrivacyPolicyLifecycleStatus.SCHEDULED:
      return PrivacyPolicyLifecycleEventType.SCHEDULED;
    case PrivacyPolicyLifecycleStatus.ACTIVE:
      return from === PrivacyPolicyLifecycleStatus.SUSPENDED
        ? PrivacyPolicyLifecycleEventType.RESUMED
        : PrivacyPolicyLifecycleEventType.ACTIVATED;
    case PrivacyPolicyLifecycleStatus.SUSPENDED:
      return PrivacyPolicyLifecycleEventType.SUSPENDED;
    case PrivacyPolicyLifecycleStatus.REVOKED:
      return PrivacyPolicyLifecycleEventType.REVOKED;
    case PrivacyPolicyLifecycleStatus.SUPERSEDED:
      return PrivacyPolicyLifecycleEventType.SUPERSEDED;
    case PrivacyPolicyLifecycleStatus.EXPIRED:
      return PrivacyPolicyLifecycleEventType.EXPIRED;
    default:
      return PrivacyPolicyLifecycleEventType.ACTIVATED;
  }
}
