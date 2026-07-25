import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowActionRunRuntimeRepository } from '../workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeService } from '../workflow-run-runtime.service';

@Injectable()
export class WorkflowDelayResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly runRuntime: WorkflowRunRuntimeService,
  ) {}

  async resumeFromTimer(orgId: string, runId: string, actionRunId: string): Promise<boolean> {
    const actionRun = await this.actionRuns.findById(orgId, actionRunId);
    if (!actionRun || actionRun.workflowRunId !== runId) return false;
    if (actionRun.status !== 'WAITING') return false;
    if (actionRun.waitingUntil && actionRun.waitingUntil.getTime() > Date.now()) {
      return false;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const count = await tx.workflowActionRun.updateMany({
        where: {
          id: actionRunId,
          organizationId: orgId,
          status: 'WAITING',
          lockVersion: actionRun.lockVersion,
        },
        data: {
          status: 'PENDING',
          waitingUntil: null,
          lockVersion: { increment: 1 },
        },
      });
      return count.count;
    });

    if (updated === 0) return false;

    await this.runRuntime.deriveAndApplyRunStatus(
      orgId,
      runId,
      { type: 'SYSTEM', source: 'timer.resume_delay' },
      'Delay elapsed — resuming workflow',
    );
    return true;
  }
}
