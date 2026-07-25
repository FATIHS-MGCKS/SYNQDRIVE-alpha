import {
  assertNoForbiddenContentInAuditPayload,
  buildPseudonymizedUserRef,
  redactCoordinatesFromAuditText,
  redactVehicleRefForAudit,
  sanitizeAuditScalar,
} from './ai-request-audit.serialization';
import {
  buildFleetRequestAuditCreateInput,
  buildToolAuditCreateInput,
} from './ai-request-audit.builder';
import type { FleetChatOrchestrateResult } from '../chat/fleet-chat-orchestrator.types';
import type { AiDomainToolRegistryAuditPayload } from '../registry/ai-domain-tool-registry.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeFleetResult(overrides: Partial<FleetChatOrchestrateResult> = {}): FleetChatOrchestrateResult {
  return {
    responseText: 'Antwort',
    route: {
      detectedIntents: ['VEHICLE_HEALTH'],
      primaryIntent: 'VEHICLE_HEALTH',
      vehicleReferences: [],
      bookingReferences: [],
      requiredTools: ['get_vehicle_health_summary'],
      ambiguities: [],
      clarificationNeeded: null,
      confidence: 0.9,
      language: 'de',
      securityFlags: [],
      vehicleResolution: {
        resolvedVehicleId: 'veh-1',
        displayName: 'VW Golf',
        licensePlate: 'B-AB 1234',
        matchType: 'license_plate_exact',
        confidence: 0.95,
        ambiguity: { isAmbiguous: false, reason: 'none', candidates: [] },
        allowedDataScope: {
          inOrganization: true,
          inStationScope: true,
          hasDimoTelemetry: true,
          operational: true,
          vehicleStatus: null,
        },
      },
      intentScores: [],
      sanitizedMessage: '',
      usedLlmClassification: false,
    },
    toolRecords: [
      {
        toolName: 'get_vehicle_health_summary',
        durationMs: 42,
        success: true,
        outcome: {
          tenantId: ORG_ID,
          data: {},
          errors: [],
          warnings: [],
          partial: false,
          allowLlmInference: true,
          evidence: [],
        },
      },
    ],
    mergedEvidence: [
      {
        tenantId: ORG_ID,
        entityId: 'veh-1',
        source: 'rental_health_service',
        sourceEntity: { kind: 'vehicle', id: 'veh-1' },
        freshness: 'live',
        confidence: 'high',
        availability: 'available',
        reasonCode: 'ok',
        sensitivity: 'internal',
        warnings: [],
        factKind: 'observed',
        value: { status: 'ok' },
        observedAt: '2026-07-25T00:00:00.000Z',
        calculatedAt: null,
      },
    ],
    partial: false,
    allowLlmInference: true,
    llmUsed: true,
    structuredResponse: {
      text: 'Antwort',
      responseType: 'HEALTH_SUMMARY',
      vehicle: { displayName: 'VW Golf', licensePlate: 'B-AB 1234' },
      dataFreshness: {
        freshness: 'live',
        observedAt: '2026-07-25T00:00:00.000Z',
        isLastKnown: false,
        label: 'Aktuell',
      },
      sources: [],
      warnings: [],
      partial: false,
      generatedAt: '2026-07-25T00:00:00.000Z',
      correlationId: 'corr-secret',
      usedDeterministicFallback: false,
    },
    audit: {
      correlationId: 'corr-secret',
      requestId: 'req-secret',
      organizationId: ORG_ID,
      userId: USER_ID,
      role: 'WORKER',
      channel: 'fleet_chat',
      primaryIntent: 'VEHICLE_HEALTH',
      detectedIntents: ['VEHICLE_HEALTH'],
      toolsRequested: ['get_vehicle_health_summary'],
      toolsSucceeded: ['get_vehicle_health_summary'],
      toolsFailed: [],
      partial: false,
      resultComplete: true,
      securityFlags: [],
      responseType: 'HEALTH_SUMMARY',
      resolvedVehicleId: 'veh-1',
      dataClassification: 'internal',
      dataSources: ['rental_health_service'],
      toolsUsed: ['get_vehicle_health_summary'],
      errorCodes: [],
      modelProvider: 'mistral',
      modelName: 'mistral-large-latest',
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      timestamp: '2026-07-25T00:00:00.000Z',
    },
    performance: {
      routingMs: 5,
      toolsMs: 42,
      compositionMs: 3,
      llmMs: 100,
      totalMs: 150,
    },
    ...overrides,
  };
}

describe('ai-request-audit.serialization', () => {
  it('strips bearer tokens and newlines from audit scalars', () => {
    const text = sanitizeAuditScalar('Bearer sk-supersecret\ninjection');
    expect(text).not.toContain('sk-supersecret');
    expect(text).not.toContain('\n');
    expect(text).toContain('[REDACTED]');
  });

  it('redacts coordinate pairs from diagnostic text', () => {
    const redacted = redactCoordinatesFromAuditText('position 52.1234, 13.5678 near city');
    expect(redacted).not.toContain('52.1234');
    expect(redacted).toContain('[REDACTED_COORD]');
  });

  it('partially masks license plates in vehicle refs', () => {
    const ref = redactVehicleRefForAudit({
      displayName: 'VW Golf',
      licensePlate: 'B-AB 1234',
    });
    expect(ref?.licensePlate).not.toBe('B-AB 1234');
    expect(ref?.displayName).toBe('VW Golf');
  });

  it('builds stable pseudonym refs', () => {
    const a = buildPseudonymizedUserRef(USER_ID, ORG_ID, 'pepper');
    const b = buildPseudonymizedUserRef(USER_ID, ORG_ID, 'pepper');
    expect(a).toBe(b);
    expect(a).toMatch(/^pseudo:/);
    expect(a).not.toContain(USER_ID);
  });
});

describe('ai-request-audit.builder', () => {
  const auditOptions = {
    storePlainUserId: false,
    userIdRefPepper: 'pepper',
    jwtSecretFallback: 'jwt-fallback',
  };

  it('does not persist prompts, responses, secrets, or coordinates', () => {
    const secretPrompt =
      'Bearer sk-live-abcdef1234567890 password=supersecret api_key=leak';
    const result = makeFleetResult({
      responseText: secretPrompt,
    });

    const payload = buildFleetRequestAuditCreateInput(
      {
        organizationId: ORG_ID,
        userId: USER_ID,
        role: 'WORKER',
        correlationId: 'corr-secret',
        requestId: 'req-secret',
        channel: 'fleet_chat',
        permissions: null,
        allowedVehicleScope: {
          mode: 'all',
          stationBypass: true,
          effectiveStationIds: null,
          vehicleIds: null,
        },
        locale: 'de',
        timezone: 'Europe/Berlin',
        dataAccessPurpose: 'fleet_assistant_query',
      },
      result,
      auditOptions,
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(secretPrompt);
    expect(serialized).not.toContain('sk-live-abcdef');
    expect(serialized).not.toContain('supersecret');
    expect(serialized).not.toContain('52.1234');
    expect(payload.userId).toBeNull();
    expect(payload.userIdRef).toMatch(/^pseudo:/);
    expect(payload.userIdRef).not.toContain(USER_ID);
    assertNoForbiddenContentInAuditPayload(serialized);
  });

  it('sanitizes tool deny audit rows', () => {
    const toolPayload: AiDomainToolRegistryAuditPayload = {
      event: 'ai.domain_tool.preflight_denied',
      toolName: 'get_vehicle_location',
      toolVersion: '1.0.0',
      decision: 'deny',
      organizationId: ORG_ID,
      userId: USER_ID,
      correlationId: 'corr-1',
      requestId: 'req-1',
      channel: 'fleet_chat',
      dataAccessPurpose: 'fleet_assistant_query',
      code: 'PERMISSION_DENIED',
      internalDetail: 'Bearer token leak',
      durationMs: 12,
    };

    const row = buildToolAuditCreateInput(toolPayload, {
      ...auditOptions,
      membershipRole: 'WORKER',
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('Bearer');
    expect(row.userId).toBeNull();
    assertNoForbiddenContentInAuditPayload(serialized);
  });
});
