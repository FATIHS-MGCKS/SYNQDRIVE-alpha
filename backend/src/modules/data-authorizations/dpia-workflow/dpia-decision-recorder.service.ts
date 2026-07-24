import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProcessingActivityDpiaDecisionType,
  ProcessingActivityDpiaStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class DpiaDecisionRecorderService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      dpiaId: string;
      decisionType: ProcessingActivityDpiaDecisionType;
      actorUserId?: string | null;
      outcome: string;
      reason?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.processingActivityDpiaDecision.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        dpiaId: input.dpiaId,
        decisionType: input.decisionType,
        actorUserId: input.actorUserId ?? null,
        outcome: input.outcome,
        reason: input.reason?.trim() || null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

export const DPIA_ACTIVATION_ALLOWED_STATUSES: ReadonlySet<ProcessingActivityDpiaStatus> = new Set([
  ProcessingActivityDpiaStatus.DPIA_NOT_REQUIRED,
  ProcessingActivityDpiaStatus.DPIA_APPROVED,
]);

export const DPIA_ACTIVATION_BLOCKED_STATUSES: ReadonlySet<ProcessingActivityDpiaStatus> = new Set([
  ProcessingActivityDpiaStatus.DPIA_REQUIRED,
  ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
  ProcessingActivityDpiaStatus.DPIA_REJECTED,
  ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE,
]);
