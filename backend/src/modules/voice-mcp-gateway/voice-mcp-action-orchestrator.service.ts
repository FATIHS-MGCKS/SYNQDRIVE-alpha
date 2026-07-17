import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VoiceToolExecutionRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceMcpApprovalService } from './voice-mcp-approval.service';
import { VoiceMcpConfirmationService } from './voice-mcp-confirmation.service';
import { VoiceMcpWriteToolsService } from './voice-mcp-write-tools.service';
import { VoiceMcpError } from './voice-mcp-errors';
import type { VoiceMcpRequestContext } from './voice-mcp-context.types';
import { getMcpToolRiskClass, isProhibitedMcpTool } from './voice-mcp-risk.registry';
import { redactToolOutput } from './voice-mcp-privacy.util';
import { stableParameterHash, stripConfirmationFields } from './voice-mcp-parameter-hash.util';
import type { VoiceMcpToolName } from './voice-mcp-gateway.constants';

@Injectable()
export class VoiceMcpActionOrchestratorService {
  constructor(
    private readonly confirmation: VoiceMcpConfirmationService,
    private readonly approval: VoiceMcpApprovalService,
    private readonly writeTools: VoiceMcpWriteToolsService,
    private readonly executions: VoiceToolExecutionRepository,
  ) {}

  async executeWriteTool(
    context: VoiceMcpRequestContext,
    toolName: VoiceMcpToolName,
    rawArgs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (isProhibitedMcpTool(toolName)) {
      throw new VoiceMcpError('ActionProhibited', `Tool ${toolName} is prohibited.`);
    }

    const confirmationToken =
      typeof rawArgs.confirmationToken === 'string' ? rawArgs.confirmationToken : undefined;
    const args = {
      ...stripConfirmationFields(rawArgs),
      _voiceContext: {
        voiceAssistantId: context.voiceAssistantId,
        agentDeploymentId: context.agentDeploymentId,
        requestId: context.requestId,
        correlationId: context.correlationId,
      },
    };

    if (!confirmationToken) {
      const proposal = await this.confirmation.createProposal(context, toolName, args);
      throw new VoiceMcpError('ConfirmationRequired', 'Customer confirmation is required before executing this action.', {
        status: 'confirmation_required',
        confirmationToken: proposal.confirmationToken,
        parameterHash: proposal.parameterHash,
        actionSummary: proposal.actionSummary,
        expiresAt: proposal.expiresAt,
        riskClass: getMcpToolRiskClass(toolName),
      });
    }

    await this.confirmation.consume(context, toolName, rawArgs, confirmationToken);

    const requestHash = stableParameterHash(args);
    const idempotencyKey = `${context.conversationId}:${toolName}:${requestHash}`;
    const riskClass = getMcpToolRiskClass(toolName);

    const { execution, created } = await this.executions.persistOrGet({
      organizationId: context.organizationId,
      voiceConversationId: context.conversationId,
      toolName,
      riskClass,
      requestHash,
      idempotencyKey,
      redactedInput: args as Prisma.InputJsonValue,
    });

    if (!created) {
      if (execution.status === 'SUCCEEDED' && execution.redactedOutput) {
        return {
          ...(execution.redactedOutput as Record<string, unknown>),
          status: 'already_completed',
        };
      }
      if (execution.status === 'PENDING') {
        throw new VoiceMcpError('ApprovalPending', 'This action is already awaiting staff approval.', {
          status: 'pending_staff_approval',
          executionId: execution.id,
        });
      }
      if (execution.status === 'DENIED') {
        throw new VoiceMcpError('ApprovalDenied', 'Staff rejected this voice action.');
      }
      if (execution.status === 'CANCELLED') {
        throw new VoiceMcpError('ApprovalExpired', 'The approval window for this action has expired.');
      }
    }

    const actionSummary = this.confirmation.summarizeAction(toolName, args);

    if (riskClass === 'STAFF_APPROVAL_REQUIRED') {
      return this.approval.createPendingStaffApproval(
        context,
        toolName,
        args,
        execution.id,
        actionSummary,
      );
    }

    const started = Date.now();
    try {
      await this.executions.markRunning(context.organizationId, execution.id);
      const result = await this.writeTools.executeDomainAction(toolName, context, args);
      const redacted = redactToolOutput(result);
      await this.executions.complete({
        organizationId: context.organizationId,
        id: execution.id,
        status: 'SUCCEEDED',
        redactedOutput: redacted as Prisma.InputJsonValue,
        durationMs: Date.now() - started,
      });
      return { status: 'completed', ...redacted };
    } catch (error) {
      await this.executions.complete({
        organizationId: context.organizationId,
        id: execution.id,
        status: 'FAILED',
        errorCode: error instanceof VoiceMcpError ? error.code : 'DataUnavailable',
        errorMessage: error instanceof Error ? error.message.slice(0, 240) : 'Execution failed',
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }
}
