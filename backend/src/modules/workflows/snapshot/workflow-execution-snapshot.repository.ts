import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES } from './workflow-execution-snapshot.errors';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowExecutionSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRunId(orgId: string, workflowRunId: string, tx: Tx = this.prisma) {
    return tx.workflowExecutionSnapshot.findFirst({
      where: { organizationId: orgId, workflowRunId },
    });
  }

  async findByRunIdOrThrow(orgId: string, workflowRunId: string, tx: Tx = this.prisma) {
    const row = await this.findByRunId(orgId, workflowRunId, tx);
    if (!row) {
      throw new NotFoundException({
        message: 'Workflow execution snapshot not found',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.NOT_FOUND,
      });
    }
    return row;
  }

  async createImmutable(
    tx: Tx,
    input: {
      orgId: string;
      workflowRunId: string;
      contentHash: string;
      payload: Prisma.InputJsonValue;
      capturedAt?: Date;
    },
  ) {
    const existing = await this.findByRunId(input.orgId, input.workflowRunId, tx);
    if (existing) {
      throw new ConflictException({
        message: 'Workflow execution snapshot already exists for this run',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.ALREADY_EXISTS,
      });
    }

    return tx.workflowExecutionSnapshot.create({
      data: {
        organizationId: input.orgId,
        workflowRunId: input.workflowRunId,
        contentHash: input.contentHash,
        payload: input.payload,
        capturedAt: input.capturedAt,
      },
    });
  }

  assertNoUpdateSupported(): never {
    throw new ConflictException({
      message: 'Workflow execution snapshots are immutable after creation',
      code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.IMMUTABLE,
    });
  }
}
