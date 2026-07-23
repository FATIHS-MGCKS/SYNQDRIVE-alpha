import { Injectable } from '@nestjs/common';
import {
  AuthorizationActorType,
  AuthorizationDecisionEventType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { validateAuthorizationDecisionEvent } from '../privacy-domain/privacy-domain.invariants';
import type { AuthorizationDecisionEvaluatedRequest, AuthorizationDecisionResult } from './authorization-decision.types';
import { AUTHORIZATION_DECISION_OUTCOME } from './authorization-decision.constants';

export interface RecordAuthorizationDecisionEventParams {
  request: AuthorizationDecisionEvaluatedRequest;
  result: AuthorizationDecisionResult;
  processingActivityOrganizationId?: string | null;
  enforcementPolicyOrganizationId?: string | null;
}

@Injectable()
export class AuthorizationDecisionEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuthorizationDecisionEventParams): Promise<string> {
    const eventType = mapDecisionToEventType(params.result);
    const id = randomUUID();

    validateAuthorizationDecisionEvent({
      organizationId: params.request.organizationId,
      processingActivityOrganizationId:
        params.processingActivityOrganizationId ?? params.request.organizationId,
      enforcementPolicyOrganizationId:
        params.enforcementPolicyOrganizationId ?? params.request.organizationId,
    });

    await this.prisma.authorizationDecisionEvent.create({
      data: {
        id,
        organizationId: params.request.organizationId,
        processingActivityId: params.result.resolverResult?.processingActivity.entityId ?? null,
        enforcementPolicyId: params.result.matchedPolicyId,
        eventType,
        pathId: params.result.resolverResult?.matchedPolicy?.id ?? null,
        dataCategory: params.request.dataCategory as never,
        processingPurpose: params.request.purpose as never,
        vehicleId: params.request.vehicleId,
        actorType: params.request.actorType ?? AuthorizationActorType.SYSTEM,
        actorId: params.request.actorId,
        decisionReason: params.result.reasonCode,
        correlationId: params.request.correlationId,
      },
    });

    return id;
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

/** Test helper — record without Prisma. */
export function buildAuthorizationDecisionEventData(
  params: RecordAuthorizationDecisionEventParams,
): Prisma.AuthorizationDecisionEventCreateInput {
  const eventType = mapDecisionToEventType(params.result);
  return {
    id: randomUUID(),
    organization: { connect: { id: params.request.organizationId } },
    eventType,
    dataCategory: params.request.dataCategory as never,
    processingPurpose: params.request.purpose as never,
    vehicleId: params.request.vehicleId,
    actorType: params.request.actorType ?? AuthorizationActorType.SYSTEM,
    actorId: params.request.actorId,
    decisionReason: params.result.reasonCode,
    correlationId: params.request.correlationId,
  };
}
