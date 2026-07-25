import { MembershipRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import { FleetChatOrchestratorService } from './fleet-chat-orchestrator.service';
import { ChatExecutionContextResolver } from './chat-execution-context.resolver';
import type { FleetChatOrchestrateResult } from './fleet-chat-orchestrator.types';

const ORG_ID = 'org-uuid-1';
const USER_ID = 'user-uuid-1';

const defaultAiConfig = {
  fleetChatDomainGroundingEnabled: true,
  fleetChatOrgAllowlist: [],
  agentMaxTokensPerLlmCall: 768,
};

function makeAiConfig(overrides: Partial<typeof defaultAiConfig> = {}) {
  return { ...defaultAiConfig, ...overrides };
}

function makeChatService(deps: {
  prisma?: ReturnType<typeof makePrisma>;
  llm?: Record<string, unknown>;
  orchestrator?: Record<string, unknown>;
  contextResolver?: Record<string, unknown>;
  requestAudit?: Record<string, unknown>;
  agentLimits?: Record<string, unknown>;
  toolCache?: Record<string, unknown>;
  aiConfiguration?: Partial<typeof defaultAiConfig>;
}) {
  const prisma = deps.prisma ?? makePrisma();
  const llm = deps.llm ?? { isConfigured: jest.fn().mockReturnValue(true), activeProviderId: 'mistral' };
  const orchestrator = deps.orchestrator ?? { orchestrate: jest.fn() };
  const contextResolver = deps.contextResolver ?? { resolve: jest.fn() };
  const requestAudit = deps.requestAudit ?? { recordFleetRequest: jest.fn() };
  const agentLimits = deps.agentLimits ?? {
    acquireChatRequest: jest.fn().mockResolvedValue({ slotKey: 'disabled' }),
    releaseChatRequest: jest.fn(),
    withRequestTimeout: jest.fn((_id: string, promise: Promise<unknown>) => promise),
    resolveLimitError: jest.fn().mockReturnValue(null),
    getMaxConversationHistory: jest.fn().mockReturnValue(100),
  };
  const toolCache = deps.toolCache ?? { clearRequest: jest.fn() };
  return new ChatService(
    prisma as any,
    llm as any,
    orchestrator as any,
    contextResolver as any,
    requestAudit as any,
    agentLimits as any,
    toolCache as any,
    makeAiConfig(deps.aiConfiguration) as any,
  );
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    organizationChatAgent: {
      findUnique: jest.fn().mockResolvedValue({
        agentName: 'acme_chatagent',
        dimoAgentId: 'mistral',
      }),
      create: jest.fn().mockResolvedValue({
        agentName: 'acme_chatagent',
        dimoAgentId: 'mistral',
      }),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ shortCode: 'acme', companyName: 'Acme GmbH' }),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn().mockResolvedValue({
        id: 'msg-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'mem-1',
        role: MembershipRole.WORKER,
        status: 'ACTIVE',
        permissions: {},
        stationScope: null,
        stationIds: null,
        fieldAgentAccess: false,
      }),
    },
  };
  return { ...base, ...overrides };
}

function makeOrchestratorResult(
  overrides: Partial<FleetChatOrchestrateResult> = {},
): FleetChatOrchestrateResult {
  return {
    responseText: 'Fleet answer from orchestrator',
    route: {
      detectedIntents: ['VEHICLE_HEALTH'],
      primaryIntent: 'VEHICLE_HEALTH',
      vehicleReferences: [],
      bookingReferences: [],
      requiredTools: [],
      ambiguities: [],
      clarificationNeeded: null,
      confidence: 0.9,
      language: 'de',
      securityFlags: [],
      vehicleResolution: {
        resolvedVehicleId: null,
        displayName: null,
        licensePlate: null,
        matchType: 'none',
        confidence: 0,
        ambiguity: { isAmbiguous: true, reason: 'none', candidates: [] },
        allowedDataScope: {
          inOrganization: true,
          inStationScope: true,
          hasDimoTelemetry: false,
          operational: true,
          vehicleStatus: null,
        },
      },
      intentScores: [],
      sanitizedMessage: '',
      usedLlmClassification: false,
    },
    toolRecords: [],
    mergedEvidence: [],
    partial: false,
    allowLlmInference: true,
    llmUsed: true,
    structuredResponse: {
      text: 'Fleet answer from orchestrator',
      responseType: 'HEALTH_SUMMARY',
      vehicle: null,
      dataFreshness: {
        freshness: 'unknown',
        observedAt: null,
        isLastKnown: false,
        label: null,
      },
      sources: [],
      warnings: [],
      partial: false,
      generatedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
      usedDeterministicFallback: false,
    },
    audit: {
      correlationId: 'corr-1',
      requestId: 'req-1',
      organizationId: ORG_ID,
      userId: USER_ID,
      role: MembershipRole.WORKER,
      channel: 'fleet_chat',
      primaryIntent: 'VEHICLE_HEALTH',
      detectedIntents: ['VEHICLE_HEALTH'],
      toolsRequested: [],
      toolsSucceeded: [],
      toolsFailed: [],
      partial: false,
      resultComplete: true,
      securityFlags: [],
      responseType: 'HEALTH_SUMMARY',
      resolvedVehicleId: null,
      dataClassification: 'internal',
      dataSources: [],
      toolsUsed: [],
      errorCodes: [],
      modelProvider: 'mistral',
      modelName: 'mistral-large-latest',
      tokenUsage: null,
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    performance: {
      routingMs: 1,
      toolsMs: 2,
      compositionMs: 3,
      llmMs: 4,
      totalMs: 10,
    },
    ...overrides,
  };
}

describe('ChatService — fleet orchestrator wiring', () => {
  it('ensureAgent registers provider id in organizationChatAgent', async () => {
    const prisma = makePrisma({
      organizationChatAgent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          agentName: 'acme_chatagent',
          dimoAgentId: 'mistral',
        }),
      },
    });
    const svc = makeChatService({
      prisma,
      llm: { isConfigured: jest.fn().mockReturnValue(true), activeProviderId: 'mistral' },
    });

    const result = await svc.ensureAgent(ORG_ID);

    expect(result.dimoAgentId).toBe('mistral');
    expect(prisma.organizationChatAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dimoAgentId: 'mistral' }),
      }),
    );
  });

  it('sendMessage uses fleet orchestrator and returns structured payload', async () => {
    const prisma = makePrisma();
    const orchestrator = {
      orchestrate: jest.fn().mockResolvedValue(makeOrchestratorResult()),
    };
    const contextResolver = {
      resolve: jest.fn().mockResolvedValue({
        organizationId: ORG_ID,
        userId: USER_ID,
        correlationId: 'corr-1',
      }),
    };
    const requestAudit = { recordFleetRequest: jest.fn() };
    const svc = makeChatService({
      prisma,
      orchestrator,
      contextResolver,
      requestAudit,
    });

    const result = await svc.sendMessage(ORG_ID, 'Wie ist die Gesundheit?', {
      userId: USER_ID,
      platformRole: null,
    });

    expect(requestAudit.recordFleetRequest).toHaveBeenCalled();
    expect(result.content).toBe('Fleet answer from orchestrator');
    expect(result.structured?.responseType).toBe('HEALTH_SUMMARY');
    expect(JSON.stringify(result.structured)).not.toContain('corr-1');
  });

  it('sendMessage returns config error when LLM is not configured', async () => {
    const orchestrator = { orchestrate: jest.fn() };
    const svc = makeChatService({
      llm: { isConfigured: jest.fn().mockReturnValue(false) },
      orchestrator,
    });

    const result = await svc.sendMessage(ORG_ID, 'Hello');

    expect(result.content).toMatch(/not configured/i);
    expect(orchestrator.orchestrate).not.toHaveBeenCalled();
  });

  it('sendMessage uses legacy direct LLM when domain grounding is disabled', async () => {
    const prisma = makePrisma({
      chatMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'msg-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'h1', role: 'user', content: 'Hi', structuredPayload: null, createdAt: new Date() },
        ]),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const orchestrator = { orchestrate: jest.fn() };
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      complete: jest.fn().mockResolvedValue({ content: 'Legacy answer' }),
    };
    const contextResolver = {
      resolve: jest.fn().mockResolvedValue({
        organizationId: ORG_ID,
        userId: USER_ID,
        correlationId: 'corr-legacy',
        locale: 'de',
      }),
    };
    const svc = makeChatService({
      prisma,
      llm,
      orchestrator,
      contextResolver,
      aiConfiguration: { fleetChatDomainGroundingEnabled: false },
    });

    const result = await svc.sendMessage(ORG_ID, 'Hello', {
      userId: USER_ID,
      platformRole: null,
    });

    expect(orchestrator.orchestrate).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalled();
    expect(result.content).toBe('Legacy answer');
    expect(result.structured?.warnings).toContain('legacy_direct_llm');
  });
});
