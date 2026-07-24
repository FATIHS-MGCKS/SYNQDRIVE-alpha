import { Injectable } from '@nestjs/common';
import { Prisma, ProcessingActivityDeletionDecisionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class RetentionDeletionAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDecision(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      processingActivityId: string;
      retentionPolicyId?: string | null;
      decisionType: ProcessingActivityDeletionDecisionType;
      actorUserId?: string | null;
      outcome: string;
      reason?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.processingActivityDeletionDecision.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        processingActivityId: input.processingActivityId,
        retentionPolicyId: input.retentionPolicyId ?? null,
        decisionType: input.decisionType,
        actorUserId: input.actorUserId ?? null,
        outcome: input.outcome,
        reason: input.reason?.trim() || null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
