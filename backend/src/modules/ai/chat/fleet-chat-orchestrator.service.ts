import { Injectable, Logger } from '@nestjs/common';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { resolveAiExecutionContextError } from '../execution/ai-execution-context.validation';
import {
  createAiDomainToolInvocationTracker,
  type AiDomainToolInvocationTracker,
  type AiDomainToolName,
} from '../registry/ai-domain-tool-registry.types';
import { AiDomainToolRegistry } from '../registry/ai-domain-tool-registry.service';
import { FleetChatIntentRouterService } from '../routing/fleet-chat-intent-router.service';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import { FLEET_CHAT_SYSTEM_PROMPT } from '../vehicle-resolution/ai-vehicle-resolution.llm';
import {
  mergeEvidenceForLlm,
} from './fleet-chat-evidence.util';
import type { FleetChatEvidenceApiResponse } from './fleet-chat-evidence-response/fleet-chat-evidence-response.types';
import { FleetChatEvidenceResponseComposerService } from './fleet-chat-evidence-response/fleet-chat-evidence-response.service';
import {
  maxDataClassification,
} from '../audit/ai-request-audit.builder';
import { AI_DOMAIN_TOOL_DEFINITION_BY_NAME } from '../registry/ai-domain-tool-registry.definitions';
import type { LlmCompleteResult } from '../llm/llm.types';
import { AiAgentLlmExecutorService } from '../limits/ai-agent-llm-executor.service';
import { AiAgentLimitsService } from '../limits/ai-agent-limits.service';
import { AiAgentToolCacheService } from '../limits/ai-agent-tool-cache.service';
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
    private readonly llmExecutor: AiAgentLlmExecutorService,
    private readonly agentLimits: AiAgentLimitsService,
    private readonly toolCache: AiAgentToolCacheService,
    private readonly evidenceResponseComposer: FleetChatEvidenceResponseComposerService,
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
      const invocationTracker = createAiDomainToolInvocationTracker();
      const maxToolInvocations = this.agentLimits.getMaxToolInvocationsPerChatRequest();
      const cappedTools = toolsRequested.slice(0, maxToolInvocations);
      try {
        const executions = await withTimeout(
          Promise.all(
            cappedTools.map(async (toolName) => {
              const toolStarted = Date.now();
              const outcome = await this.toolRegistry.executeRegisteredTool({
                context,
                toolName,
                rawInput: buildToolInput(toolName, vehicleId, input.bookingId),
                options: {
                  invocationTracker,
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

    const mergedEvidence = mergeEvidenceForLlm(toolRecords);
    const partial =
      route.ambiguities.length > 0 ||
      toolRecords.some((record) => record.outcome.partial || record.outcome.errors.length > 0);

    const allowLlmInference =
      route.confidence > 0 &&
      !route.securityFlags.includes('prompt_injection_attempt') &&
      (toolRecords.length === 0 ||
        toolRecords.every((record) => record.outcome.allowLlmInference));

    const compositionStarted = Date.now();
    const evidenceComposeBase = {
      correlationId: context.correlationId,
      userMessage: input.message,
      language: route.language,
      route,
      toolRecords,
      mergedEvidence,
      partial,
      allowLlmInference,
    };
    const prepared = this.evidenceResponseComposer.prepare(evidenceComposeBase);
    compositionMs = Date.now() - compositionStarted;

    let responseText = prepared.directResponse ?? '';
    let structuredResponse: FleetChatEvidenceApiResponse | null = null;
    let llmUsed = false;
    let llmResult: LlmCompleteResult | null = null;

    if (!prepared.skipLlm && prepared.llmUserContext) {
      const llmStarted = Date.now();
      try {
        llmResult = await withTimeout(
          this.callLlm(context, prepared.llmUserContext, route.language),
          FLEET_CHAT_ORCHESTRATOR_LLM_TIMEOUT_MS,
          'LLM',
        );
        responseText = llmResult.content.trim();
        llmUsed = true;
      } catch {
        responseText =
          route.language === 'de'
            ? 'Der Assistent konnte die Anfrage gerade nicht verarbeiten. Bitte versuchen Sie es erneut.'
            : 'The assistant could not process your request right now. Please try again.';
      }
      llmMs = Date.now() - llmStarted;
    }

    structuredResponse = this.evidenceResponseComposer.finalize(
      evidenceComposeBase,
      llmUsed ? prepared.responseType : 'TEMPORARY_UNAVAILABLE',
      responseText,
    );
    responseText = structuredResponse.text;

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
      structuredResponse,
      llmResult,
    });
  }

  private selectTools(required: readonly AiDomainToolName[]): readonly AiDomainToolName[] {
    return [...new Set(required)].filter((toolName) =>
      this.toolRegistry.isRegisteredToolName(toolName),
    );
  }

  private async callLlm(
    context: AiExecutionContext,
    userContext: string,
    language: 'de' | 'en' | 'unknown',
  ): Promise<LlmCompleteResult> {
    const localeHint =
      language === 'de'
        ? 'Antworte auf Deutsch.'
        : language === 'en'
          ? 'Answer in English.'
          : 'Prefer the user language.';

    return this.llmExecutor.completeForChat(context, {
      purpose: 'chat',
      temperature: 0.2,
      maxTokens: this.agentLimits.getMaxTokensPerLlmCall(),
      messages: [
        { role: 'system', content: `${FLEET_CHAT_SYSTEM_PROMPT}\n${localeHint}` },
        {
          role: 'user',
          content: `Grounded facts (do not invent beyond this):\n${userContext}`,
        },
      ],
    });
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
    structuredResponse?: FleetChatEvidenceApiResponse;
    llmResult?: LlmCompleteResult | null;
  }): FleetChatOrchestrateResult {
    const toolClassifications = input.toolRecords.map((record) => {
      const def = AI_DOMAIN_TOOL_DEFINITION_BY_NAME[record.toolName];
      return def?.dataClassification ?? 'internal';
    });
    const evidenceClassifications = input.mergedEvidence.map((e) => e.sensitivity);
    const dataClassification = maxDataClassification([
      ...toolClassifications,
      ...evidenceClassifications,
    ]);
    const dataSources = [...new Set(input.mergedEvidence.map((evidence) => evidence.source))];
    const errorCodes = [
      ...new Set(
        input.toolRecords.flatMap((record) =>
          record.outcome.errors.map((error) => error.code),
        ),
      ),
    ];
    const resultComplete = !input.partial;

    return {
      responseText: input.responseText,
      route: input.route,
      toolRecords: input.toolRecords,
      mergedEvidence: input.mergedEvidence,
      partial: input.partial,
      allowLlmInference: input.allowLlmInference,
      llmUsed: input.llmUsed,
      structuredResponse: input.structuredResponse,
      audit: {
        correlationId: input.context.correlationId,
        requestId: input.context.requestId,
        organizationId: input.context.organizationId,
        userId: input.context.userId,
        role: input.context.role,
        channel: input.context.channel,
        primaryIntent: input.route.primaryIntent,
        detectedIntents: input.route.detectedIntents,
        toolsRequested: input.toolsRequested,
        toolsSucceeded: input.toolsSucceeded,
        toolsFailed: input.toolsFailed,
        partial: input.partial,
        resultComplete,
        securityFlags: input.route.securityFlags,
        responseType: input.structuredResponse?.responseType ?? null,
        resolvedVehicleId: input.route.vehicleResolution.resolvedVehicleId,
        dataClassification,
        dataSources,
        toolsUsed: input.toolsRequested,
        errorCodes,
        modelProvider: input.llmUsed ? this.llmExecutor.getActiveProviderId() : null,
        modelName: input.llmResult?.model ?? null,
        tokenUsage: input.llmResult?.usage ?? null,
        timestamp: new Date().toISOString(),
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
