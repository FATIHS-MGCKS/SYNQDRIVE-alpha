import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  COMPENSATABLE_INTERNAL_ACTION_TYPES,
  isActionCompensatable,
} from './workflow-action-error-strategy.constants';

@Injectable()
export class WorkflowActionCompensationService {
  constructor(private readonly prisma: PrismaService) {}

  async compensatePrevious(input: {
    organizationId: string;
    workflowRunId: string;
    failedActionRunId: string;
    compensateActionKey: string;
    actionType: string;
    compensatable: boolean;
  }) {
    if (!isActionCompensatable(input.actionType, input.compensatable)) {
      throw new BadRequestException(
        `Action type ${input.actionType} is not compensatable — external communication cannot be reliably reversed`,
      );
    }

    const priorSucceeded = await this.prisma.workflowActionRun.findMany({
      where: {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        status: 'SUCCEEDED',
        actionType: { in: [...COMPENSATABLE_INTERNAL_ACTION_TYPES] },
      },
      orderBy: { actionIndex: 'desc' },
    });

    const compensated = priorSucceeded.map((action) => ({
      actionRunId: action.id,
      actionType: action.actionType,
      actionKey: action.actionKey,
      compensateActionKey: input.compensateActionKey,
      status: 'COMPENSATION_REQUESTED' as const,
    }));

    return {
      failedActionRunId: input.failedActionRunId,
      compensatedActions: compensated,
      auditNote:
        compensated.length > 0
          ? `Compensation requested for ${compensated.length} prior internal action(s)`
          : 'No compensatable prior actions found',
    };
  }
}
