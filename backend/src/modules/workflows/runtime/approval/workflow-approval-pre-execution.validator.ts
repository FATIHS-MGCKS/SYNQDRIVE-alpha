import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  WorkflowApprovalPreExecutionCheck,
  WorkflowApprovalPreExecutionResult,
} from './workflow-approval.types';

@Injectable()
export class WorkflowApprovalPreExecutionValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validate(input: {
    organizationId: string;
    workflowRunId: string;
    workflowVersionId: string;
    actionRunId: string;
    actionType: string;
    entityType: string | null;
    entityId: string | null;
    definitionSnapshot: unknown;
  }): Promise<WorkflowApprovalPreExecutionResult> {
    const checks: WorkflowApprovalPreExecutionCheck[] = [];

    checks.push(await this.checkWorkflowVersionValid(input.organizationId, input.workflowVersionId));
    checks.push(await this.checkEntityPresent(input.organizationId, input.entityType, input.entityId));
    checks.push(this.checkActionInSnapshot(input.definitionSnapshot, input.actionType));
    checks.push(this.checkRecipientPolicy(input.actionType));
    checks.push(this.checkCommunicationPreference(input.actionType));

    return {
      passed: checks.every((c) => c.passed),
      checks,
    };
  }

  private async checkWorkflowVersionValid(
    orgId: string,
    versionId: string,
  ): Promise<WorkflowApprovalPreExecutionCheck> {
    const version = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, organizationId: orgId },
      select: { status: true, invalidatedAt: true },
    });
    const passed =
      !!version &&
      version.invalidatedAt == null &&
      (version.status === 'ACTIVE' || version.status === 'PUBLISHED');
    return {
      code: 'WORKFLOW_VERSION_VALID',
      passed,
      message: passed ? 'Workflow version is still valid' : 'Workflow version is no longer valid',
    };
  }

  private async checkEntityPresent(
    orgId: string,
    entityType: string | null,
    entityId: string | null,
  ): Promise<WorkflowApprovalPreExecutionCheck> {
    if (!entityType || !entityId) {
      return { code: 'ENTITY_PRESENT', passed: true, message: 'No entity binding required' };
    }

    if (entityType === 'vehicle') {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: entityId, organizationId: orgId },
        select: { id: true },
      });
      return {
        code: 'ENTITY_PRESENT',
        passed: !!vehicle,
        message: vehicle ? 'Vehicle entity exists' : 'Vehicle entity no longer present',
      };
    }

    if (entityType === 'booking') {
      const booking = await this.prisma.booking.findFirst({
        where: { id: entityId, organizationId: orgId },
        select: { id: true },
      });
      return {
        code: 'ENTITY_PRESENT',
        passed: !!booking,
        message: booking ? 'Booking entity exists' : 'Booking entity no longer present',
      };
    }

    return { code: 'ENTITY_PRESENT', passed: true, message: 'Entity type not strictly validated' };
  }

  private checkActionInSnapshot(
    definitionSnapshot: unknown,
    actionType: string,
  ): WorkflowApprovalPreExecutionCheck {
    if (!definitionSnapshot || typeof definitionSnapshot !== 'object') {
      return {
        code: 'ACTION_RELEVANT',
        passed: true,
        message: 'No snapshot to validate — allowing resume',
      };
    }
    const actions = (definitionSnapshot as { actions?: unknown[] }).actions;
    if (!Array.isArray(actions)) {
      return { code: 'ACTION_RELEVANT', passed: true, message: 'Snapshot has no action list' };
    }
    const found = actions.some(
      (a) => a && typeof a === 'object' && (a as { actionType?: string }).actionType === actionType,
    );
    return {
      code: 'ACTION_RELEVANT',
      passed: found,
      message: found ? 'Action still defined in snapshot' : 'Action no longer in workflow snapshot',
    };
  }

  private checkRecipientPolicy(actionType: string): WorkflowApprovalPreExecutionCheck {
    if (!actionType.includes('notification') && !actionType.includes('contact')) {
      return { code: 'RECIPIENT_VALID', passed: true, message: 'No recipient check required' };
    }
    return {
      code: 'RECIPIENT_VALID',
      passed: true,
      message: 'Recipient policy check deferred to action executor',
    };
  }

  private checkCommunicationPreference(actionType: string): WorkflowApprovalPreExecutionCheck {
    if (!actionType.includes('notification')) {
      return {
        code: 'COMMUNICATION_PREFERENCE',
        passed: true,
        message: 'No communication preference check required',
      };
    }
    return {
      code: 'COMMUNICATION_PREFERENCE',
      passed: true,
      message: 'Communication preference check deferred to action executor',
    };
  }
}
