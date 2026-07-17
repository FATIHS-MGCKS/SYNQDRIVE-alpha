import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import {
  VoiceApprovalRequestRepository,
  VoiceToolExecutionRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VOICE_MCP_STAFF_APPROVAL_TTL_SECONDS } from './voice-mcp-gateway.constants';
import { VoiceMcpError } from './voice-mcp-errors';
import { VoiceMcpWriteToolsService } from './voice-mcp-write-tools.service';
import type { VoiceMcpRequestContext } from './voice-mcp-context.types';
import { stableParameterHash, stripConfirmationFields } from './voice-mcp-parameter-hash.util';
import { redactToolOutput } from './voice-mcp-privacy.util';

const STAFF_APPROVER_ROLES = new Set(['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN']);

@Injectable()
export class VoiceMcpApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: VoiceApprovalRequestRepository,
    private readonly executions: VoiceToolExecutionRepository,
    private readonly writeTools: VoiceMcpWriteToolsService,
    private readonly tasksService: TasksService,
  ) {}

  async createPendingStaffApproval(
    context: VoiceMcpRequestContext,
    toolName: string,
    args: Record<string, unknown>,
    executionId: string,
    actionSummary: string,
  ) {
    await this.approvals.expireStale(context.organizationId);
    const expiresAt = new Date(Date.now() + VOICE_MCP_STAFF_APPROVAL_TTL_SECONDS * 1000);

    const approval = await this.approvals.create({
      organizationId: context.organizationId,
      toolExecutionId: executionId,
      confirmationType: 'STAFF',
      expiresAt,
      protectedDecisionTokenRef: stableParameterHash(args),
    });

    await this.tasksService.createManualTask(
      context.organizationId,
      {
        title: `Approve voice AI action`,
        description: actionSummary,
        type: 'CUSTOM',
        sourceType: 'SYSTEM',
        source: 'VOICE_MCP_APPROVAL',
        priority: 'HIGH',
        dedupKey: `voice:approval:${approval.id}`,
        metadata: {
          voiceConversationId: context.conversationId,
          approvalRequestId: approval.id,
          toolName,
        },
      },
      undefined,
    );

    return {
      status: 'pending_staff_approval' as const,
      approvalRequestId: approval.id,
      expiresAt: expiresAt.toISOString(),
      actionSummary,
    };
  }

  async approve(orgId: string, approvalId: string, userId: string) {
    await this.assertApprover(orgId, userId);
    const decided = await this.approvals.decide({
      organizationId: orgId,
      id: approvalId,
      decidedByUserId: userId,
      status: 'APPROVED',
    });

    const execution = decided.toolExecution;
    const args = (execution.redactedInput ?? {}) as Record<string, unknown>;
    const context = this.rebuildContext(orgId, execution.voiceConversationId, args);
    const started = Date.now();

    try {
      await this.executions.markRunning(orgId, execution.id);
      const result = await this.writeTools.executeDomainAction(
        execution.toolName,
        context,
        stripConfirmationFields(args),
      );
      const redacted = redactToolOutput(result);
      await this.executions.complete({
        organizationId: orgId,
        id: execution.id,
        status: 'SUCCEEDED',
        redactedOutput: redacted as Prisma.InputJsonValue,
        durationMs: Date.now() - started,
      });
      return { status: 'completed' as const, result: redacted };
    } catch (error) {
      await this.executions.complete({
        organizationId: orgId,
        id: execution.id,
        status: 'FAILED',
        errorCode: 'DataUnavailable',
        errorMessage: error instanceof Error ? error.message.slice(0, 240) : 'Execution failed',
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  async reject(orgId: string, approvalId: string, userId: string, reason?: string) {
    await this.assertApprover(orgId, userId);
    const decided = await this.approvals.decide({
      organizationId: orgId,
      id: approvalId,
      decidedByUserId: userId,
      status: 'REJECTED',
      decisionReason: reason ?? null,
    });

    await this.executions.complete({
      organizationId: orgId,
      id: decided.toolExecutionId,
      status: 'DENIED',
      errorCode: 'ApprovalDenied',
      errorMessage: 'Staff rejected the proposed voice action.',
    });

    return { status: 'rejected' as const, approvalRequestId: approvalId };
  }

  private async assertApprover(orgId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: orgId,
        userId,
      },
      select: { role: true },
    });

    if (!membership || !STAFF_APPROVER_ROLES.has(membership.role)) {
      throw new VoiceMcpError('PermissionDenied', 'Only authorized staff can decide voice approvals.');
    }
  }

  private rebuildContext(
    organizationId: string,
    conversationId: string,
    args: Record<string, unknown>,
  ): VoiceMcpRequestContext {
    const metadata = (args._voiceContext ?? {}) as Record<string, unknown>;
    return {
      organizationId,
      voiceAssistantId: String(metadata.voiceAssistantId ?? ''),
      agentDeploymentId: String(metadata.agentDeploymentId ?? ''),
      conversationId,
      allowedTools: [],
      scopes: [],
      issuedAt: 0,
      expiresAt: 0,
      nonce: '',
      requestId: String(metadata.requestId ?? 'approval'),
      correlationId: String(metadata.correlationId ?? 'approval'),
    };
  }
}
