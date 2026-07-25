import { Injectable, Logger } from '@nestjs/common';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { resolveAiExecutionContextError } from '../execution/ai-execution-context.validation';
import {
  createAiDomainToolInvocationTracker,
  type AiDomainToolName,
} from '../registry/ai-domain-tool-registry.types';
import { AiDomainToolRegistry } from '../registry/ai-domain-tool-registry.service';
import { FleetChatIntentRouterService } from '../routing/fleet-chat-intent-router.service';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import {
  buildActiveRulesBlock,
  buildFleetChatSystemMessage,
  detectActiveScenarios,
  type FleetChatAnswerScenario,
} from './fleet-chat-policy';
import {
  mergeEvidenceForLlm,
  summarizeToolDataForLlm,
} from './fleet-chat-evidence.util';
import { composeFleetChatResponse } from './fleet-chat-response.composer';
import type {
  FleetChatOrchestrateInput,
  FleetChatOrchestrateResult,
  FleetChatToolExecutionRecord,
} from './fleet-chat-orchestrator.types';
import {
  FLEET_CHAT_ORCHESTRATOR_LLM_TIMEOUT_MS,
  FLEET_CHAT_ORCHESTRATOR_TOOL_BUDGET_MS,
} from './fleet-chat-orchestrator.types';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildToolInput(
  toolName: AiDomainToolName,
  vehicleId: string,
  bookingId?: string | null,
): Record<string, unknown> {
  if (toolName === 'explain_overdue_return' && bookingId?.trim()) {
    return { vehicleId, bookingId: bookingId.trim() };
  }
  return { vehicleId };
}

function emptyRouteResult(): FleetChatRouteResult {
  return {
    detectedIntents: ['AMBIGUOUS'],
    primaryIntent: 'AMBIGUOUS',
    vehicleReferences: [],
    bookingReferences: [],
    requiredTools: [],
    ambiguities: [],
    clarificationNeeded: null,
    confidence: 0,
    language: 'unknown',
    securityFlags: [],
    vehicleResolution: {
      resolvedVehicleId: null,
      displayName: null,
      licensePlate: null,
      matchType: 'none',
      confidence: 0,
      ambiguity: { isAmbiguous: true, reason: 'context_invalid', candidates: [] },
      allowedDataScope: {
        inOrganization: false,
        inStationScope: false,
        hasDimoTelemetry: false,
        operational: false,
        vehicleStatus: null,
      },
    },
    intentScores: [],
    usedLlmClassification: false,
    sanitizedMessage: '',
  };
}

@Injectable()
export class FleetChatOrchestratorService {
  private readonly logger = new Logger(FleetChatOrchestratorService.name);

  constructor(
    private readonly intentRouter: FleetChatIntentRouterService,
    private readonly toolRegistry: AiDomainToolRegistry,
    private readonly llm: LlmGatewayService,
  ) {}

  async orchestrate(
    context: AiExecutionContext,
    input: FleetChatOrchestrateInput,
  ): Promise<FleetChatOrchestrateResult> {
    const startedAt = Date.now();
    let routingMs = 0;
    let toolsMs = 0;
    let compositionMs = 0;
    let llmMs = 0;

    const contextError = resolveAiExecutionContextError(context);
    if (contextError) {
      return this.buildFailureResult(
        context,
        startedAt,
        contextError.publicMessage,
      );
    }

    const routingStarted = Date.now();
    const route = await this.intentRouter.route({
      organizationId: context.organizationId,
      message: input.message,
      allowedVehicleScope: context.allowedVehicleScope,
      bookingId: input.bookingId,
    });
    routingMs = Date.now() - routingStarted;

    if (route.clarificationNeeded) {
      const clarification = route.clarificationNeeded;
      const text =
        route.language === 'de' ? clarification.messageDe : clarification.messageEn;
      return this.buildResult({
        context,
        route,
        startedAt,
        routingMs,
        toolsMs: 0,
        compositionMs: 0,
        llmMs: 0,
        responseText: text,
        toolRecords: [],
        mergedEvidence: [],
        partial: true,
        allowLlmInference: false,
        llmUsed: false,
        toolsRequested: [],
        toolsSucceeded: [],
        toolsFailed: [],
      });
    }

    const toolsRequested = this.selectTools(route.requiredTools);
    const toolRecords: FleetChatToolExecutionRecord[] = [];

    if (toolsRequested.length > 0) {
      const vehicleId = route.vehicleResolution.resolvedVehicleId;
      if (!vehicleId) {
        const text =
          route.language === 'de'
            ? 'Bitte nennen Sie das Kennzeichen oder den eindeutigen Fahrzeugnamen.'
            : 'Please specify the license plate or unique vehicle name.';
        return this.buildResult({
          context,
          route,
          startedAt,
          routingMs,
          toolsMs: 0,
          compositionMs: 0,
          llmMs: 0,
          responseText: text,
          toolRecords: [],
          mergedEvidence: [],
          partial: true,
          allowLlmInference: false,
          llmUsed: false,
          toolsRequested,
          toolsSucceeded: [],
          toolsFailed: [],
        });
      }

      const toolsStarted = Date.now();
      try {
        const executions = await withTimeout(
          Promise.all(
            toolsRequested.map(async (toolName) => {
              const toolStarted = Date.now();
              const outcome = await this.toolRegistry.executeRegisteredTool({
                context,
                toolName,
                rawInput: buildToolInput(toolName, vehicleId, input.bookingId),
                options: {
                  invocationTracker: createAiDomainToolInvocationTracker(),
                },
              });
              return {
                toolName,
                outcome,
                durationMs: Date.now() - toolStarted,
                success: outcome.data != null || outcome.partial,
              };
            }),
          ),
          FLEET_CHAT_ORCHESTRATOR_TOOL_BUDGET_MS,
          'TOOL_BUDGET',
        );
        toolRecords.push(...executions);
      } catch (error: unknown) {
        this.logger.warn(
          `[FleetChatOrchestrator] tool batch failed corr=${context.correlationId}`,
        );
      }
      toolsMs = Date.now() - toolsStarted;
    }

    const evidenceSummaries = toolRecords.flatMap((record) =>
      summarizeToolDataForLlm(record.toolName, record.outcome.data),
    );
    const mergedEvidence = mergeEvidenceForLlm(toolRecords);
    const partial =
      route.ambiguities.length > 0 ||
      toolRecords.some((record) => record.outcome.partial || record.outcome.errors.length > 0);

    const allowLlmInference =
      route.confidence > 0 &&
      !route.securityFlags.includes('prompt_injection_attempt') &&
      (toolRecords.length === 0 ||
        toolRecords.every((record) => record.outcome.allowLlmInference));

    const activeScenarios = detectActiveScenarios(route, toolRecords, partial);
    const compositionStarted = Date.now();
    const composed = composeFleetChatResponse({
      userMessage: input.message,
      language: route.language,
      route,
      toolRecords,
      evidenceSummaries,
      partial,
      allowLlmInference,
      activeScenarios,
    });
    compositionMs = Date.now() - compositionStarted;

    let responseText = composed.directResponse ?? '';
    let llmUsed = false;

    if (!composed.skipLlm && composed.llmUserContext) {
      const llmStarted = Date.now();
      try {
        responseText = await withTimeout(
          this.callLlm(composed.llmUserContext, route.language, activeScenarios),
          FLEET_CHAT_ORCHESTRATOR_LLM_TIMEOUT_MS,
          'LLM',
        );
        llmUsed = true;
      } catch {
        responseText =
          route.language === 'de'
            ? 'Der Assistent konnte die Anfrage gerade nicht verarbeiten. Bitte versuchen Sie es erneut.'
            : 'The assistant could not process your request right now. Please try again.';
      }
      llmMs = Date.now() - llmStarted;
    }

    const toolsSucceeded = toolRecords
      .filter((record) => record.success)
      .map((record) => record.toolName);
    const toolsFailed = toolRecords
      .filter((record) => !record.success)
      .map((record) => record.toolName);

    return this.buildResult({
      context,
      route,
      startedAt,
      routingMs,
      toolsMs,
      compositionMs,
      llmMs,
      responseText,
      toolRecords,
      mergedEvidence,
      partial: partial || !allowLlmInference,
      allowLlmInference,
      llmUsed,
      toolsRequested,
      toolsSucceeded,
      toolsFailed,
    });
  }

  private selectTools(required: readonly AiDomainToolName[]): readonly AiDomainToolName[] {
    return [...new Set(required)].filter((toolName) =>
      this.toolRegistry.isRegisteredToolName(toolName),
    );
  }

  private async callLlm(
    userContext: string,
    language: 'de' | 'en' | 'unknown',
    activeScenarios: readonly FleetChatAnswerScenario[],
  ): Promise<string> {
    const systemContent = buildFleetChatSystemMessage(language, {
      scenarios: activeScenarios,
    });

    const result = await this.llm.complete({
      purpose: 'chat',
      temperature: 0.2,
      maxTokens: 768,
      messages: [
        { role: 'system', content: systemContent },
        {
          role: 'user',
          content: `Grounded facts (do not invent beyond this):\n${userContext}`,
        },
      ],
    });
    return result.content.trim();
  }

  private buildFailureResult(
    context: AiExecutionContext,
    startedAt: number,
    message: string,
  ): FleetChatOrchestrateResult {
    return this.buildResult({
      context,
      route: emptyRouteResult(),
      startedAt,
      routingMs: 0,
      toolsMs: 0,
      compositionMs: 0,
      llmMs: 0,
      responseText: message,
      toolRecords: [],
      mergedEvidence: [],
      partial: true,
      allowLlmInference: false,
      llmUsed: false,
      toolsRequested: [],
      toolsSucceeded: [],
      toolsFailed: [],
    });
  }

  private buildResult(input: {
    context: AiExecutionContext;
    route: FleetChatRouteResult;
    startedAt: number;
    routingMs: number;
    toolsMs: number;
    compositionMs: number;
    llmMs: number;
    responseText: string;
    toolRecords: readonly FleetChatToolExecutionRecord[];
    mergedEvidence: import('../evidence/ai-evidence.types').AiEvidence[];
    partial: boolean;
    allowLlmInference: boolean;
    llmUsed: boolean;
    toolsRequested: readonly AiDomainToolName[];
    toolsSucceeded: readonly AiDomainToolName[];
    toolsFailed: readonly AiDomainToolName[];
  }): FleetChatOrchestrateResult {
    return {
      responseText: input.responseText,
      route: input.route,
      toolRecords: input.toolRecords,
      mergedEvidence: input.mergedEvidence,
      partial: input.partial,
      allowLlmInference: input.allowLlmInference,
      llmUsed: input.llmUsed,
      audit: {
        correlationId: input.context.correlationId,
        requestId: input.context.requestId,
        organizationId: input.context.organizationId,
        userId: input.context.userId,
        channel: input.context.channel,
        primaryIntent: input.route.primaryIntent,
        detectedIntents: input.route.detectedIntents,
        toolsRequested: input.toolsRequested,
        toolsSucceeded: input.toolsSucceeded,
        toolsFailed: input.toolsFailed,
        partial: input.partial,
        securityFlags: input.route.securityFlags,
      },
      performance: {
        routingMs: input.routingMs,
        toolsMs: input.toolsMs,
        compositionMs: input.compositionMs,
        llmMs: input.llmMs,
        totalMs: Date.now() - input.startedAt,
      },
    };
  }
}
