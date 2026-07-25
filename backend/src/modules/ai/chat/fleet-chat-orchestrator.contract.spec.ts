import { createPermissionDeniedError } from '../evidence/ai-domain-error.factory';
import { FleetChatOrchestratorService } from './fleet-chat-orchestrator.service';
import { FleetChatIntentRouterService } from '../routing/fleet-chat-intent-router.service';
import { AiDomainToolRegistry } from '../registry/ai-domain-tool-registry.service';
import { AiAgentLlmExecutorService } from '../limits/ai-agent-llm-executor.service';
import { AiAgentLimitsService } from '../limits/ai-agent-limits.service';
import { AiAgentToolCacheService } from '../limits/ai-agent-tool-cache.service';
import { FleetChatEvidenceResponseComposerService } from './fleet-chat-evidence-response/fleet-chat-evidence-response.service';
import {
  composeFleetChatEvidenceResponse,
  finalizeFleetChatEvidenceResponse,
  prepareFleetChatEvidenceResponse,
} from './fleet-chat-evidence-response/fleet-chat-evidence-response.composer';
import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
import {
  buildFleetAiContext,
  FLEET_AI_ORG_ID,
  FLEET_AI_VEHICLE_TIGUAN_A,
  makeFleetRoute,
  makeFleetToolRecord,
} from '../__fixtures__/fleet-ai-test.fixtures';

function makeOutcome(
  toolName: AiDomainToolName,
  data: Record<string, unknown> | null,
  errors: ReturnType<typeof makeFleetToolRecord>['outcome']['errors'] = [],
) {
  return {
    tenantId: FLEET_AI_ORG_ID,
    partial: errors.length > 0 && data != null,
    data,
    evidence: [],
    errors,
    warnings: [],
    allowLlmInference: errors.length === 0,
  };
}

function createContractOrchestrator(input: {
  route?: ReturnType<typeof makeFleetRoute>;
  toolOutcomes?: Record<string, ReturnType<typeof makeOutcome>>;
  maxInvocations?: number;
  llmExecutor?: Partial<AiAgentLlmExecutorService>;
}) {
  const intentRouter = {
    route: jest.fn().mockResolvedValue(input.route ?? makeFleetRoute()),
  } as unknown as FleetChatIntentRouterService;

  const executeRegisteredTool = jest.fn(async ({ toolName }: { toolName: string }) => {
    return input.toolOutcomes?.[toolName] ?? makeOutcome(toolName as AiDomainToolName, null);
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

  const llmExecutor = {
    completeForChat: jest.fn().mockResolvedValue({
      content: 'Grounded answer.',
      model: 'mistral-large-latest',
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
    }),
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
    getMaxToolInvocationsPerChatRequest: jest
      .fn()
      .mockReturnValue(input.maxInvocations ?? 8),
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

  return { orchestrator, executeRegisteredTool, llmExecutor, agentLimits };
}

describe('FleetChatOrchestratorService — contract matrix', () => {
  it('truncates tool execution when requiredTools exceed max invocations', async () => {
    const route = makeFleetRoute({
      primaryIntent: 'COMBINED_VEHICLE_STATUS',
      requiredTools: [
        'explain_overdue_return',
        'get_vehicle_location',
        'get_vehicle_health_summary',
        'get_vehicle_telemetry_status',
      ],
    });

    const { orchestrator, executeRegisteredTool } = createContractOrchestrator({
      route,
      maxInvocations: 2,
      toolOutcomes: {
        explain_overdue_return: makeOutcome('explain_overdue_return', { returnOverdue: true }),
        get_vehicle_location: makeOutcome('get_vehicle_location', { latitude: 1, longitude: 2 }),
        get_vehicle_health_summary: makeOutcome('get_vehicle_health_summary', {
          overallStatus: 'ok',
        }),
        get_vehicle_telemetry_status: makeOutcome('get_vehicle_telemetry_status', {
          connectivity: 'live',
        }),
      },
    });

    await orchestrator.orchestrate(buildFleetAiContext(), { message: 'combined status' });

    expect(executeRegisteredTool).toHaveBeenCalledTimes(2);
    expect(executeRegisteredTool.mock.calls.map((c) => c[0].toolName)).toEqual([
      'explain_overdue_return',
      'get_vehicle_location',
    ]);
  });

  it('routes SYNQDRIVE_KNOWLEDGE without domain tools or LLM', async () => {
    const route = makeFleetRoute({
      primaryIntent: 'SYNQDRIVE_KNOWLEDGE',
      detectedIntents: ['SYNQDRIVE_KNOWLEDGE'],
      requiredTools: [],
    });

    const { orchestrator, executeRegisteredTool, llmExecutor } = createContractOrchestrator({
      route,
    });

    const result = await orchestrator.orchestrate(buildFleetAiContext(), {
      message: 'Wie funktioniert SynqDrive?',
    });

    expect(executeRegisteredTool).not.toHaveBeenCalled();
    expect(llmExecutor.completeForChat).not.toHaveBeenCalled();
    expect(result.llmUsed).toBe(false);
    expect(result.structuredResponse?.responseType).toBe('TEMPORARY_UNAVAILABLE');
    expect(result.responseText).toMatch(/Domain-Daten|fleet assistant|nicht beantworten/i);
  });

  it('returns PARTIAL_DATA when all tools fail', async () => {
    const permissionError = createPermissionDeniedError({
      organizationId: FLEET_AI_ORG_ID,
    });

    const { orchestrator } = createContractOrchestrator({
      route: makeFleetRoute({
        primaryIntent: 'VEHICLE_HEALTH',
        requiredTools: ['get_vehicle_health_summary'],
      }),
      toolOutcomes: {
        get_vehicle_health_summary: makeOutcome('get_vehicle_health_summary', null, [
          permissionError,
        ]),
      },
    });

    const result = await orchestrator.orchestrate(buildFleetAiContext(), {
      message: 'Health check',
    });

    expect(result.partial).toBe(true);
    expect(result.allowLlmInference).toBe(false);
    expect(result.structuredResponse?.responseType).toBe('PERMISSION_RESTRICTED');
  });

  it('returns INCONSISTENT_STATE when health flags domain inconsistency', async () => {
    const { orchestrator } = createContractOrchestrator({
      route: makeFleetRoute({
        primaryIntent: 'VEHICLE_HEALTH',
        requiredTools: ['get_vehicle_health_summary'],
      }),
      toolOutcomes: {
        get_vehicle_health_summary: makeOutcome('get_vehicle_health_summary', {
          overallStatus: 'warning',
          inconsistencyFlags: ['domain_status_inconsistent'],
        }),
      },
    });

    const result = await orchestrator.orchestrate(buildFleetAiContext(), {
      message: 'Inkonsistenter Status',
    });

    expect(result.structuredResponse?.responseType).toBe('INCONSISTENT_STATE');
    expect(result.llmUsed).toBe(true);
  });

  it('returns TEMPORARY_UNAVAILABLE when LLM executor fails', async () => {
    const { orchestrator } = createContractOrchestrator({
      toolOutcomes: {
        get_vehicle_location: makeOutcome('get_vehicle_location', {
          latitude: 52.42,
          longitude: 10.78,
          isLastKnownLocation: false,
        }),
      },
      llmExecutor: {
        completeForChat: jest
          .fn()
          .mockRejectedValue(new Error('HTTP 429 rate limit exceeded')),
      },
    });

    const result = await orchestrator.orchestrate(buildFleetAiContext(), {
      message: 'Wo steht es?',
    });

    expect(result.llmUsed).toBe(false);
    expect(result.structuredResponse?.responseType).toBe('TEMPORARY_UNAVAILABLE');
    expect(result.responseText).toMatch(/nicht verarbeiten|could not process/i);
  });
});
