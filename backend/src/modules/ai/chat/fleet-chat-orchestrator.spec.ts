import { MembershipRole, VehicleStatus } from '@prisma/client';
import { buildAiExecutionContext } from '../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import type { FleetChatRouteResult } from '../routing/fleet-chat-intent.types';
import type { AiDomainToolName } from '../registry/ai-domain-tool-registry.types';
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

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

function buildContext(
  overrides: Partial<Parameters<typeof buildAiExecutionContext>[0]> = {},
): AiExecutionContext {
  return buildAiExecutionContext({
    organizationId: ORG_ID,
    userId: USER_ID,
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'fleet-condition': { read: true, write: false },
      bookings: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-orch-001',
    requestId: 'req-orch-001',
    ...overrides,
  });
}

function makeRoute(overrides: Partial<FleetChatRouteResult> = {}): FleetChatRouteResult {
  return {
    detectedIntents: ['VEHICLE_LOCATION'],
    primaryIntent: 'VEHICLE_LOCATION',
    vehicleReferences: [
      {
        vehicleId: VEHICLE_ID,
        displayName: 'VW Tiguan 2021',
        licensePlate: 'WOB-L 7503',
        matchType: 'license_plate_exact',
        confidence: 0.95,
        source: 'hardened_resolver',
      },
    ],
    bookingReferences: [],
    requiredTools: ['get_vehicle_location'],
    ambiguities: [],
    clarificationNeeded: null,
    confidence: 0.82,
    language: 'de',
    securityFlags: [],
    vehicleResolution: {
      resolvedVehicleId: VEHICLE_ID,
      displayName: 'VW Tiguan 2021',
      licensePlate: 'WOB-L 7503',
      matchType: 'license_plate_exact',
      confidence: 0.95,
      ambiguity: { isAmbiguous: false, reason: null, candidates: [] },
      allowedDataScope: {
        inOrganization: true,
        inStationScope: true,
        hasDimoTelemetry: true,
        operational: true,
        vehicleStatus: VehicleStatus.AVAILABLE,
      },
    },
    intentScores: [],
    usedLlmClassification: false,
    sanitizedMessage: 'test',
    ...overrides,
  };
}

function makeOutcome(
  toolName: AiDomainToolName,
  data: Record<string, unknown> | null,
  errors: readonly import('../evidence/ai-domain-error.types').AiDomainError[] = [],
) {
  return {
    tenantId: ORG_ID,
    partial: errors.length > 0 && data != null,
    data,
    evidence: [],
    errors,
    warnings: [],
    allowLlmInference: errors.length === 0,
  };
}

function createOrchestrator(input: {
  route?: FleetChatRouteResult;
  toolOutcomes?: Record<string, ReturnType<typeof makeOutcome>>;
  llmExecutor?: Partial<AiAgentLlmExecutorService>;
}) {
  const intentRouter = {
    route: jest.fn().mockResolvedValue(input.route ?? makeRoute()),
  } as unknown as FleetChatIntentRouterService;

  const executeRegisteredTool = jest.fn(async ({ toolName }: { toolName: string }) => {
    const outcome = input.toolOutcomes?.[toolName] ?? makeOutcome(toolName as AiDomainToolName, null);
    return outcome;
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
      content: 'Synthesized fleet answer.',
      model: 'mistral-large-latest',
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
    }),
    getActiveProviderId: jest.fn().mockReturnValue('mistral'),
    ...input.llmExecutor,
  } as unknown as AiAgentLlmExecutorService;

  const evidenceComposer = {
    prepare: jest.fn((input) => {
      const prepared = prepareFleetChatEvidenceResponse(input);
      return prepared;
    }),
    finalize: jest.fn((input, responseType, llmRawText) =>
      finalizeFleetChatEvidenceResponse(input, responseType, llmRawText),
    ),
    compose: jest.fn((input) => composeFleetChatEvidenceResponse(input)),
  } as unknown as FleetChatEvidenceResponseComposerService;

  const agentLimits = {
    getMaxToolInvocationsPerChatRequest: jest.fn().mockReturnValue(8),
    getMaxLlmRetries: jest.fn().mockReturnValue(1),
    getMaxTokensPerLlmCall: jest.fn().mockReturnValue(768),
  } as unknown as AiAgentLimitsService;

  const toolCache = {
    clearRequest: jest.fn(),
  } as unknown as AiAgentToolCacheService;

  const orchestrator = new FleetChatOrchestratorService(
    intentRouter,
    toolRegistry,
    llmExecutor,
    agentLimits,
    toolCache,
    evidenceComposer,
  );

  return { orchestrator, intentRouter, toolRegistry, llmExecutor, executeRegisteredTool };
}

describe('FleetChatOrchestratorService — integration', () => {
  it('handles single location question', async () => {
    const { orchestrator, executeRegisteredTool, llmExecutor } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'VEHICLE_LOCATION',
        requiredTools: ['get_vehicle_location'],
      }),
      toolOutcomes: {
        get_vehicle_location: makeOutcome('get_vehicle_location', {
          vehicleId: VEHICLE_ID,
          latitude: 52.42,
          longitude: 10.78,
          isLastKnownLocation: false,
        }),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Wo steht WOB L 7503?',
    });

    expect(executeRegisteredTool).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'get_vehicle_location' }),
    );
    expect(result.llmUsed).toBe(true);
    expect(result.audit.toolsSucceeded).toContain('get_vehicle_location');
    expect(llmExecutor.completeForChat).toHaveBeenCalled();
  });

  it('handles health question', async () => {
    const { orchestrator } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'VEHICLE_HEALTH',
        detectedIntents: ['VEHICLE_HEALTH'],
        requiredTools: ['get_vehicle_health_summary'],
      }),
      toolOutcomes: {
        get_vehicle_health_summary: makeOutcome('get_vehicle_health_summary', {
          vehicleId: VEHICLE_ID,
          overallStatus: 'warning',
        }),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Gesundheit WOB L 7503',
    });

    expect(result.route.primaryIntent).toBe('VEHICLE_HEALTH');
    expect(result.audit.toolsRequested).toContain('get_vehicle_health_summary');
  });

  it('handles overdue explanation question', async () => {
    const { orchestrator } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'OVERDUE_RETURN_EXPLANATION',
        detectedIntents: ['OVERDUE_RETURN_EXPLANATION'],
        requiredTools: ['explain_overdue_return'],
      }),
      toolOutcomes: {
        explain_overdue_return: makeOutcome('explain_overdue_return', {
          explanation: 'Rückgabe überfällig.',
          returnOverdue: true,
        }),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Warum überfällig WOB L 7503?',
    });

    expect(result.audit.toolsRequested).toContain('explain_overdue_return');
  });

  it('handles combined question with parallel tools', async () => {
    const { orchestrator, executeRegisteredTool } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'COMBINED_VEHICLE_STATUS',
        detectedIntents: ['OVERDUE_RETURN_EXPLANATION', 'VEHICLE_LOCATION', 'COMBINED_VEHICLE_STATUS'],
        requiredTools: ['explain_overdue_return', 'get_vehicle_location'],
      }),
      toolOutcomes: {
        explain_overdue_return: makeOutcome('explain_overdue_return', {
          returnOverdue: true,
        }),
        get_vehicle_location: makeOutcome('get_vehicle_location', {
          latitude: 52.1,
          longitude: 10.7,
        }),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Warum ist WOB L 7503 überfällig und wo steht es?',
    });

    expect(executeRegisteredTool).toHaveBeenCalledTimes(2);
    expect(result.audit.toolsSucceeded).toEqual(
      expect.arrayContaining(['explain_overdue_return', 'get_vehicle_location']),
    );
  });

  it('returns clarification for ambiguous vehicle', async () => {
    const { orchestrator, llmExecutor } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'AMBIGUOUS',
        clarificationNeeded: {
          kind: 'vehicle_ambiguous',
          messageDe: 'Bitte Kennzeichen nennen.',
          messageEn: 'Please specify plate.',
          candidatePlates: ['WOB-L 7503', 'B-XY 9901'],
        },
        vehicleResolution: {
          resolvedVehicleId: null,
          displayName: null,
          licensePlate: null,
          matchType: 'none',
          confidence: 0,
          ambiguity: {
            isAmbiguous: true,
            reason: 'multiple_vehicles_match',
            candidates: [],
          },
          allowedDataScope: {
            inOrganization: true,
            inStationScope: true,
            hasDimoTelemetry: false,
            operational: false,
            vehicleStatus: null,
          },
        },
        requiredTools: [],
      }),
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Wie ist der Tiguan?',
    });

    expect(result.responseText).toContain('Kennzeichen');
    expect(result.llmUsed).toBe(false);
    expect(llmExecutor.completeForChat).not.toHaveBeenCalled();
  });

  it('allows partial answer when one tool fails', async () => {
    const { orchestrator } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'COMBINED_VEHICLE_STATUS',
        requiredTools: ['explain_overdue_return', 'get_vehicle_location'],
      }),
      toolOutcomes: {
        explain_overdue_return: makeOutcome(
          'explain_overdue_return',
          { returnOverdue: true },
          [],
        ),
        get_vehicle_location: makeOutcome(
          'get_vehicle_location',
          null,
          [
            {
              code: 'timeout',
              publicMessage: 'Timeout',
              severity: 'error',
              retryPolicy: 'retryable',
              httpStatus: 504,
              auditEvent: 'ai.domain_query.timeout',
              maskEntityExistence: false,
              blockLlmInference: false,
              diagnostics: {},
            },
          ],
        ),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'überfällig und wo steht WOB L 7503',
    });

    expect(result.partial).toBe(true);
    expect(result.audit.toolsFailed).toContain('get_vehicle_location');
    expect(result.audit.toolsSucceeded).toContain('explain_overdue_return');
  });

  it('handles full provider outage without throwing', async () => {
    const { orchestrator, llmExecutor } = createOrchestrator({
      route: makeRoute({ requiredTools: ['get_vehicle_location'] }),
      toolOutcomes: {
        get_vehicle_location: makeOutcome('get_vehicle_location', {
          latitude: 1,
          longitude: 2,
        }),
      },
      llmExecutor: {
        completeForChat: jest.fn().mockRejectedValue(new Error('LLM_TIMEOUT')),
      },
    });

    const result = await orchestrator.orchestrate(buildContext(), {
      message: 'Wo steht WOB L 7503?',
    });

    expect(result.responseText).toMatch(/nicht verarbeiten|could not process/i);
    expect(result.structuredResponse?.responseType).toBe('TEMPORARY_UNAVAILABLE');
    expect(result.llmUsed).toBe(false);
  });

  it('denies when permission missing on tool preflight', async () => {
    const { orchestrator } = createOrchestrator({
      route: makeRoute({
        primaryIntent: 'VEHICLE_HEALTH',
        requiredTools: ['get_vehicle_health_summary'],
      }),
      toolOutcomes: {
        get_vehicle_health_summary: makeOutcome(
          'get_vehicle_health_summary',
          null,
          [
            {
              code: 'permission_denied',
              publicMessage: 'Forbidden',
              severity: 'error',
              retryPolicy: 'non_retryable',
              httpStatus: 403,
              auditEvent: 'ai.domain_query.permission_denied',
              maskEntityExistence: true,
              blockLlmInference: true,
              diagnostics: {},
            },
          ],
        ),
      },
    });

    const result = await orchestrator.orchestrate(
      buildContext({
        permissions: { 'ai-assistant': { read: true, write: false }, fleet: { read: true, write: false } },
      }),
      { message: 'Health WOB L 7503' },
    );

    expect(result.partial).toBe(true);
    expect(result.allowLlmInference).toBe(false);
    expect(result.audit.toolsFailed).toContain('get_vehicle_health_summary');
  });
});
