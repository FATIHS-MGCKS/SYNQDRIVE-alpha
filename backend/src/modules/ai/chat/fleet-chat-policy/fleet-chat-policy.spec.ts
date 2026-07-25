import {
  FLEET_CHAT_ANSWER_SCENARIOS,
  FLEET_CHAT_ANSWER_SECTIONS,
  FLEET_CHAT_POLICY_VERSION,
  FLEET_CHAT_SYSTEM_PROMPT_MAX_CHARS,
} from './fleet-chat-policy.constants';
import {
  buildActiveRulesBlock,
  buildFleetChatSystemMessage,
  detectActiveScenarios,
} from './fleet-chat-policy.builder';
import { FLEET_CHAT_POLICY_CORE_PROMPT } from './fleet-chat-policy.prompt';
import { FLEET_CHAT_SCENARIO_RULES } from './fleet-chat-policy.rules';
import type { FleetChatRouteResult } from '../../routing/fleet-chat-intent.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function emptyRoute(): FleetChatRouteResult {
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
      ambiguity: { isAmbiguous: true, reason: 'none', candidates: [] },
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

function toolRecord(
  toolName: FleetChatToolExecutionRecord['toolName'],
  data: unknown,
  options: {
    success?: boolean;
    outcome?: Partial<FleetChatToolExecutionRecord['outcome']>;
  } = {},
): FleetChatToolExecutionRecord {
  return {
    toolName,
    durationMs: 1,
    success: options.success ?? data != null,
    outcome: {
      tenantId: ORG_ID,
      partial: false,
      data,
      evidence: [],
      errors: [],
      warnings: [],
      allowLlmInference: true,
      ...options.outcome,
    },
  };
}

describe('fleet-chat-policy', () => {
  it('exposes semantic version and answer sections', () => {
    expect(FLEET_CHAT_POLICY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(FLEET_CHAT_ANSWER_SECTIONS).toHaveLength(7);
    expect(FLEET_CHAT_ANSWER_SCENARIOS).toHaveLength(FLEET_CHAT_SCENARIO_RULES.length);
  });

  it('keeps core system prompt compact and versioned', () => {
    expect(FLEET_CHAT_POLICY_CORE_PROMPT).toContain(`policy=${FLEET_CHAT_POLICY_VERSION}`);
    expect(FLEET_CHAT_POLICY_CORE_PROMPT.length).toBeLessThanOrEqual(
      FLEET_CHAT_SYSTEM_PROMPT_MAX_CHARS,
    );
    expect(FLEET_CHAT_POLICY_CORE_PROMPT).toContain('domain tools');
    expect(FLEET_CHAT_POLICY_CORE_PROMPT).toContain('do not send users to external DIMO dashboards');
  });

  it('golden: full system message includes locale and active rules', () => {
    const message = buildFleetChatSystemMessage('de', {
      scenarios: ['live_position', 'no_data_not_ok'],
    });
    expect(message).toContain('Antworte auf Deutsch');
    expect(message).toContain('Live-Position');
    expect(message).toContain('Keine Daten');
  });

  it('detects live vs last-known vs stale position', () => {
    const live = detectActiveScenarios(
      emptyRoute(),
      [toolRecord('get_vehicle_location', { freshness: 'live', isLastKnownLocation: false })],
      false,
    );
    expect(live).toEqual(expect.arrayContaining(['live_position']));

    const lastKnown = detectActiveScenarios(
      emptyRoute(),
      [
        toolRecord('get_vehicle_location', {
          freshness: 'standby',
          isLastKnownLocation: true,
        }),
      ],
      false,
    );
    expect(lastKnown).toEqual(
      expect.arrayContaining(['last_known_position', 'stale_position']),
    );
  });

  it('detects health limited vs full', () => {
    const limited = detectActiveScenarios(
      emptyRoute(),
      [toolRecord('get_vehicle_health_summary', { limitedData: true })],
      false,
    );
    expect(limited).toContain('health_limited');

    const full = detectActiveScenarios(
      emptyRoute(),
      [toolRecord('get_vehicle_health_summary', { limitedData: false })],
      false,
    );
    expect(full).toContain('health_full');
  });

  it('detects overdue, inconsistency, permission, ambiguity, partial', () => {
    const route = {
      ...emptyRoute(),
      ambiguities: [{ kind: 'vehicle' as const, reason: 'multiple_matches' }],
      vehicleResolution: {
        ...emptyRoute().vehicleResolution,
        ambiguity: { isAmbiguous: true, reason: 'multiple_matches', candidates: [] },
      },
    };
    const scenarios = detectActiveScenarios(
      route,
      [
        toolRecord(
          'explain_overdue_return',
          { returnOverdue: true, reasonCodes: ['RETURN_DEADLINE_PASSED'] },
          { outcome: { partial: true } },
        ),
        toolRecord('get_vehicle_booking_context', {
          inconsistencyFlags: ['FLEET_CONTEXT_DIVERGENCE'],
        }),
        toolRecord('get_vehicle_location', null, {
          success: false,
          outcome: {
            errors: [
              {
                code: 'permission_denied',
                publicMessage: 'denied',
                severity: 'warning',
                retryPolicy: 'non_retryable',
                httpStatus: 403,
                auditEvent: 'ai.domain_query.permission_denied',
                maskEntityExistence: true,
                blockLlmInference: true,
                diagnostics: {},
              },
            ],
          },
        }),
      ],
      true,
    );

    expect(scenarios).toEqual(
      expect.arrayContaining([
        'vehicle_ambiguous',
        'partial_tool_results',
        'permission_denied',
        'overdue_return',
        'status_inconsistent',
      ]),
    );
  });

  it('flags no_data_not_ok when tools return no payload', () => {
    const scenarios = detectActiveScenarios(
      emptyRoute(),
      [toolRecord('get_vehicle_location', null, { success: false })],
      false,
    );
    expect(scenarios).toContain('no_data_not_ok');
    expect(scenarios).toContain('partial_tool_results');
  });

  it('buildActiveRulesBlock returns null for empty scenarios', () => {
    expect(buildActiveRulesBlock('en', [])).toBeNull();
  });
});
