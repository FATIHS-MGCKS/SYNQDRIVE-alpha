import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkflowRuntimeStatusActorType,
  WorkflowRuntimeStatusEntityType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowRuntimeActor } from './workflow-runtime-status.types';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowRuntimeStatusAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordRunTransition(
    tx: Tx,
    input: {
      orgId: string;
      workflowRunId: string;
      fromStatus: string;
      toStatus: string;
      actor: WorkflowRuntimeActor;
      reason?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await tx.workflowRuntimeStatusTransition.create({
      data: {
        organizationId: input.orgId,
        entityType: WorkflowRuntimeStatusEntityType.RUN,
        workflowRunId: input.workflowRunId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        actorSource: input.actor.source,
        reason: input.reason ?? null,
        metadata: input.metadata,
      },
    });
  }

  async recordActionRunTransition(
    tx: Tx,
    input: {
      orgId: string;
      workflowRunId: string;
      actionRunId: string;
      fromStatus: string;
      toStatus: string;
      actor: WorkflowRuntimeActor;
      reason?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await tx.workflowRuntimeStatusTransition.create({
      data: {
        organizationId: input.orgId,
        entityType: WorkflowRuntimeStatusEntityType.ACTION_RUN,
        workflowRunId: input.workflowRunId,
        actionRunId: input.actionRunId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        actorSource: input.actor.source,
        reason: input.reason ?? null,
        metadata: input.metadata,
      },
    });
  }

  listForRun(orgId: string, workflowRunId: string) {
    return this.prisma.workflowRuntimeStatusTransition.findMany({
      where: { organizationId: orgId, workflowRunId },
      orderBy: { occurredAt: 'asc' },
    });
  }
}

export { WorkflowRuntimeStatusActorType };
