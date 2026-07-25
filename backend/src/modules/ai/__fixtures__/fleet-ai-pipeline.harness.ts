import { FleetChatOrchestratorService } from '../chat/fleet-chat-orchestrator.service';
import { FleetChatIntentRouterService } from '../routing/fleet-chat-intent-router.service';
import { AiDomainToolRegistry } from '../registry/ai-domain-tool-registry.service';
import { AiAgentLlmExecutorService } from '../limits/ai-agent-llm-executor.service';
import { AiAgentLimitsService } from '../limits/ai-agent-limits.service';
import { AiAgentToolCacheService } from '../limits/ai-agent-tool-cache.service';
import { FleetChatEvidenceResponseComposerService } from '../chat/fleet-chat-evidence-response/fleet-chat-evidence-response.service';
import {
  composeFleetChatEvidenceResponse,
  finalizeFleetChatEvidenceResponse,
  prepareFleetChatEvidenceResponse,
} from '../chat/fleet-chat-evidence-response/fleet-chat-evidence-response.composer';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';
import {
  buildFleetAiContext,
  FLEET_AI_ORG_ID,
  makeFleetRoute,
} from './fleet-ai-test.fixtures';

export interface FleetAiPipelineHarness {
  orchestrator: FleetChatOrchestratorService;
  executeRegisteredTool: jest.Mock;
  llmCompleteForChat: jest.Mock;
}

export function createFleetAiPipelineHarness(input: {
  route?: FleetChatRouteResult;
  toolOutcomes?: Record<string, AiDomainQueryOutcome<unknown>>;
  llmExecutor?: Partial<AiAgentLlmExecutorService>;
}): FleetAiPipelineHarness {
  const route = input.route ?? makeFleetRoute();
  const intentRouter = {
    route: jest.fn().mockResolvedValue(route),
  } as unknown as FleetChatIntentRouterService;

  const executeRegisteredTool = jest.fn(async ({ toolName }: { toolName: string }) => {
    const outcome = input.toolOutcomes?.[toolName];
    if (outcome) return outcome;
    return {
      tenantId: FLEET_AI_ORG_ID,
      partial: true,
      data: null,
      evidence: [],
      errors: [],
      warnings: [],
      allowLlmInference: false,
    } satisfies AiDomainQueryOutcome<unknown>;
  });

  const toolRegistry = {
    isRegisteredToolName: (name: string) =>
      [
        'get_vehicle_location',
        'get_vehicle_telemetry_status',
        'get_vehicle_health_summary',
        'explain_overdue_return',
        'get_vehicle_booking_context',
      ].includes(name),
    executeRegisteredTool,
  } as unknown as AiDomainToolRegistry;

  const llmCompleteForChat = jest.fn().mockResolvedValue({
    content: '',
    model: 'mistral-large-latest',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  });

  const llmExecutor = {
    completeForChat: llmCompleteForChat,
    getActiveProviderId: jest.fn().mockReturnValue('mistral'),
    ...input.llmExecutor,
  } as unknown as AiAgentLlmExecutorService;

  const evidenceComposer = {
    prepare: jest.fn((composeInput) => prepareFleetChatEvidenceResponse(composeInput)),
    finalize: jest.fn((composeInput, responseType, llmRawText) =>
      finalizeFleetChatEvidenceResponse(composeInput, responseType, llmRawText),
    ),
    compose: jest.fn((composeInput) => composeFleetChatEvidenceResponse(composeInput)),
  } as unknown as FleetChatEvidenceResponseComposerService;

  const agentLimits = {
    getMaxToolInvocationsPerChatRequest: jest.fn().mockReturnValue(8),
    getMaxLlmRetries: jest.fn().mockReturnValue(1),
    getMaxTokensPerLlmCall: jest.fn().mockReturnValue(768),
  } as unknown as AiAgentLimitsService;

  const toolCache = { clearRequest: jest.fn() } as unknown as AiAgentToolCacheService;

  const orchestrator = new FleetChatOrchestratorService(
    intentRouter,
    toolRegistry,
    llmExecutor,
    agentLimits,
    toolCache,
    evidenceComposer,
  );

  return {
    orchestrator,
    executeRegisteredTool,
    llmCompleteForChat: (llmExecutor as unknown as { completeForChat: jest.Mock }).completeForChat,
  };
}

export function runPipelineScenario(input: {
  route?: FleetChatRouteResult;
  toolOutcomes?: Record<string, AiDomainQueryOutcome<unknown>>;
  message: string;
  locale?: 'de' | 'en';
  /** When true (default), LLM returns empty content so finalize uses deterministic fallback. */
  useDeterministicFallback?: boolean;
}) {
  const useFallback = input.useDeterministicFallback ?? true;
  const harness = createFleetAiPipelineHarness({
    route: input.route,
    toolOutcomes: input.toolOutcomes,
    llmExecutor: useFallback
      ? {
          completeForChat: jest.fn().mockResolvedValue({
            content: '',
            model: 'mistral-large-latest',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
        }
      : undefined,
  });

  const context = buildFleetAiContext({
    locale: input.locale ?? 'de',
    correlationId: `flow-${Date.now()}`,
  });

  return harness.orchestrator.orchestrate(context, { message: input.message });
}
