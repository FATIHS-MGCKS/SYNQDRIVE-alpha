import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { APPROVAL_REQUIRED_ACTIONS } from '../workflow.constants';
import { loadVersionGraph } from '../workflow-version-graph.service';
import {
  buildExecutionSnapshotPayload,
  buildPolicyPayloadForCapture,
  buildPolicySnapshotBlock,
  computeExecutionSnapshotHash,
  computePolicyContentHash,
} from './workflow-execution-snapshot.builder';
import { WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES } from './workflow-execution-snapshot.errors';
import { WorkflowExecutionSnapshotRepository } from './workflow-execution-snapshot.repository';
import type {
  WorkflowExecutionSnapshotCaptureInput,
  WorkflowExecutionSnapshotPayload,
} from './workflow-execution-snapshot.types';

export interface CaptureWorkflowExecutionSnapshotInput
  extends Omit<WorkflowExecutionSnapshotCaptureInput, 'organizationId'> {
  orgId: string;
}

@Injectable()
export class WorkflowExecutionSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: WorkflowExecutionSnapshotRepository,
  ) {}

  assertAuditReadAllowed(userRoles: string[] | undefined) {
    const allowed = new Set(['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN']);
    if (!userRoles?.some((role) => allowed.has(role))) {
      throw new ForbiddenException({
        message: 'Workflow execution snapshot audit read permission required',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.AUDIT_READ_FORBIDDEN,
      });
    }
  }

  async getSnapshotForAudit(orgId: string, workflowRunId: string, userRoles?: string[]) {
    this.assertAuditReadAllowed(userRoles);
    const row = await this.snapshots.findByRunIdOrThrow(orgId, workflowRunId);
    return {
      id: row.id,
      workflowRunId: row.workflowRunId,
      snapshotVersion: row.snapshotVersion,
      contentHash: row.contentHash,
      capturedAt: row.capturedAt,
      payload: row.payload as unknown as WorkflowExecutionSnapshotPayload,
    };
  }

  async captureAtRunStart(input: CaptureWorkflowExecutionSnapshotInput) {
    const versionGraph = await loadVersionGraph(
      this.prisma,
      input.orgId,
      input.workflowVersionId,
    );
    if (!versionGraph) {
      throw new NotFoundException({
        message: 'Workflow version not found',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.VERSION_NOT_FOUND,
      });
    }
    if (versionGraph.workflowDefinitionId !== input.workflowDefinitionId) {
      throw new BadRequestException({
        message: 'Workflow version does not belong to definition',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.INVALID_VERSION_STATE,
      });
    }

    const run = await this.prisma.workflowRun.findFirst({
      where: { id: input.workflowRunId, organizationId: input.orgId },
    });
    if (!run) {
      throw new NotFoundException({
        message: 'Workflow run not found',
        code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.RUN_NOT_FOUND,
      });
    }

    const featureFlags = await this.prisma.workflowFeatureFlag.findMany({
      where: {
        OR: [
          { scope: 'PLATFORM' },
          { organizationId: input.orgId, scope: 'ORGANIZATION' },
          {
            organizationId: input.orgId,
            scope: 'WORKFLOW_DEFINITION',
            workflowDefinitionId: input.workflowDefinitionId,
          },
        ],
      },
    });

    const policyPayload = buildPolicyPayloadForCapture(featureFlags);
    const policyContentHash = computePolicyContentHash(policyPayload);
    const approvalRequiredActionTypes = versionGraph.actions
      .filter(
        (a) => a.requiresApproval || APPROVAL_REQUIRED_ACTIONS.has(a.actionType),
      )
      .map((a) => a.actionType);

    const capturedAt = input.capturedAt ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      let policySnapshot = await tx.workflowPolicySnapshot.findFirst({
        where: { organizationId: input.orgId, contentHash: policyContentHash },
      });
      if (!policySnapshot) {
        policySnapshot = await tx.workflowPolicySnapshot.create({
          data: {
            organizationId: input.orgId,
            capabilityRevision: policyPayload.capabilityRevision,
            approvalResumeSupported: policyPayload.approvalResumeSupported,
            approvalTtlHours: policyPayload.approvalTtlHours,
            policyPayload: policyPayload as Prisma.InputJsonValue,
            contentHash: policyContentHash,
            capturedAt,
          },
        });
      }

      const policies = buildPolicySnapshotBlock({
        policySnapshotId: policySnapshot.id,
        capabilityRevision: policySnapshot.capabilityRevision,
        contentHash: policySnapshot.contentHash,
        approvalResumeSupported: policySnapshot.approvalResumeSupported,
        approvalTtlHours: policySnapshot.approvalTtlHours,
        approvalRequiredActionTypes,
        featureFlags,
      });

      const payload = buildExecutionSnapshotPayload(
        { ...versionGraph, definition: await tx.workflowDefinition.findFirstOrThrow({
          where: { id: input.workflowDefinitionId, organizationId: input.orgId },
        }) },
        {
          organizationId: input.orgId,
          workflowRunId: input.workflowRunId,
          workflowDefinitionId: input.workflowDefinitionId,
          workflowVersionId: input.workflowVersionId,
          policySnapshotId: policySnapshot.id,
          event: input.event,
          rawEventPayload: input.rawEventPayload,
          conditionEvaluation: input.conditionEvaluation,
          capturedAt,
          policies,
        },
      );

      const contentHash = computeExecutionSnapshotHash(payload);
      const snapshot = await this.snapshots.createImmutable(tx, {
        orgId: input.orgId,
        workflowRunId: input.workflowRunId,
        contentHash,
        payload: payload as unknown as Prisma.InputJsonValue,
        capturedAt,
      });

      await tx.workflowRun.updateMany({
        where: {
          id: input.workflowRunId,
          organizationId: input.orgId,
        },
        data: {
          policySnapshotId: policySnapshot.id,
          definitionSnapshot: {
            graph: payload.graph,
            definition: payload.definition,
            policies: payload.policies,
            templates: payload.templates,
          } as unknown as Prisma.InputJsonValue,
          inputPayload: payload.event.payload.minimizedPayload as Prisma.InputJsonValue,
          conditionResult: input.conditionEvaluation
            ? (input.conditionEvaluation as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });

      return {
        snapshotId: snapshot.id,
        contentHash,
        payload,
      };
    });
  }

  updateSnapshot(): never {
    return this.snapshots.assertNoUpdateSupported();
  }
}
