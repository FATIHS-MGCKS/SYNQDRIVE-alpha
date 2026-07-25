import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import workflowRuntimeConfig from '@config/workflow-runtime.config';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  WorkflowIdempotencyDecisionInput,
  WorkflowIdempotencyReplayMode,
} from './workflow-idempotency.types';
import { buildForceReplayOccurrenceId } from './workflow-idempotency-key.builder';

export interface IdempotencyDecisionRecord {
  id: string;
  outcome: string;
  reason: string;
  scopeKey: string;
  createdAt: Date;
}

@Injectable()
export class WorkflowIdempotencyService {
  private readonly logger = new Logger(WorkflowIdempotencyService.name);

  constructor(
    @Inject(workflowRuntimeConfig.KEY)
    private readonly config: ConfigType<typeof workflowRuntimeConfig>,
    private readonly prisma: PrismaService,
  ) {}

  get deduplicationWindowMs(): number {
    return this.config.idempotencyDedupWindowMs;
  }

  isWithinDeduplicationWindow(createdAt: Date, now = new Date()): boolean {
    return now.getTime() - createdAt.getTime() <= this.deduplicationWindowMs;
  }

  resolveReplayOccurrenceId(
    baseOccurrenceId: string,
    mode: WorkflowIdempotencyReplayMode,
    replayToken?: string,
  ): string {
    if (mode === 'SAME') return baseOccurrenceId;
    const token = replayToken?.trim() || crypto.randomUUID();
    return buildForceReplayOccurrenceId(baseOccurrenceId, token);
  }

  async recordDecision(
    input: WorkflowIdempotencyDecisionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyDecisionRecord> {
    const client = tx ?? this.prisma;
    const row = await client.workflowIdempotencyDecision.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        scopeKey: input.scopeKey,
        outcome: input.outcome,
        reason: input.reason,
        occurrenceId: input.occurrenceId ?? null,
        eventId: input.eventId ?? null,
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
        workflowRunId: input.workflowRunId ?? null,
        actionId: input.actionId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.logger.debug(
      `Idempotency ${input.outcome} entity=${input.entityType} scope=${input.scopeKey} reason=${input.reason}`,
    );
    return {
      id: row.id,
      outcome: row.outcome,
      reason: row.reason,
      scopeKey: row.scopeKey,
      createdAt: row.createdAt,
    };
  }

  async findLatestDecision(
    organizationId: string,
    entityType: WorkflowIdempotencyDecisionInput['entityType'],
    scopeKey: string,
  ): Promise<IdempotencyDecisionRecord | null> {
    const row = await this.prisma.workflowIdempotencyDecision.findFirst({
      where: { organizationId, entityType, scopeKey },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      outcome: row.outcome,
      reason: row.reason,
      scopeKey: row.scopeKey,
      createdAt: row.createdAt,
    };
  }

  explainDuplicateSuppression(input: {
    entityType: WorkflowIdempotencyDecisionInput['entityType'];
    scopeKey: string;
    existingId?: string;
    withinWindow?: boolean;
  }): string {
    const windowNote =
      input.withinWindow === false
        ? 'outside deduplication window but unique constraint still applies'
        : 'within deduplication window';
    return `Duplicate ${input.entityType} suppressed for scopeKey=${input.scopeKey} (${windowNote})${
      input.existingId ? `; existingId=${input.existingId}` : ''
    }`;
  }

  isUniqueConstraintError(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }
}
