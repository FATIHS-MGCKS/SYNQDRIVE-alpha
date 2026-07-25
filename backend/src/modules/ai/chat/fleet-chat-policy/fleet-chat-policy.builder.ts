import type { FleetChatRouteResult } from '../../routing/fleet-chat-intent.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';
import type { FleetChatAnswerScenario } from './fleet-chat-policy.constants';
import { FLEET_CHAT_SCENARIO_RULE_BY_SCENARIO } from './fleet-chat-policy.rules';
import { FLEET_CHAT_POLICY_CORE_PROMPT } from './fleet-chat-policy.prompt';

const STALE_FRESHNESS = new Set(['signal_delayed', 'offline', 'no_signal', 'standby']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasPositionSignals(
  toolName: string,
  record: Record<string, unknown>,
): boolean {
  return (
    toolName === 'get_vehicle_location' ||
    'isLastKnownLocation' in record ||
    'latitude' in record ||
    'longitude' in record
  );
}

function isHealthRecord(toolName: string, record: Record<string, unknown>): boolean {
  return toolName === 'get_vehicle_health_summary' || 'limitedData' in record || 'domains' in record;
}

function isOverdueRecord(toolName: string, record: Record<string, unknown>): boolean {
  return (
    toolName === 'explain_overdue_return' ||
    record.returnOverdue === true ||
    (Array.isArray(record.reasonCodes) && record.reasonCodes.length > 0)
  );
}

export function detectActiveScenarios(
  route: FleetChatRouteResult,
  toolRecords: readonly FleetChatToolExecutionRecord[],
  partial: boolean,
): readonly FleetChatAnswerScenario[] {
  const scenarios = new Set<FleetChatAnswerScenario>();

  if (
    route.clarificationNeeded?.kind === 'vehicle_ambiguous' ||
    route.vehicleResolution.ambiguity.isAmbiguous ||
    route.ambiguities.some((ambiguity) => ambiguity.kind === 'vehicle')
  ) {
    scenarios.add('vehicle_ambiguous');
  }

  if (
    partial ||
    toolRecords.some((record) => record.outcome.partial) ||
    toolRecords.some((record) => !record.success)
  ) {
    scenarios.add('partial_tool_results');
  }

  if (
    toolRecords.some((record) =>
      record.outcome.errors.some((error) => error.code === 'permission_denied'),
    )
  ) {
    scenarios.add('permission_denied');
  }

  let sawData = false;
  for (const record of toolRecords) {
    const data = asRecord(record.outcome.data);
    if (!data) {
      continue;
    }
    sawData = true;

    if (hasPositionSignals(record.toolName, data)) {
      const freshness = String(data.freshness ?? '');
      if (data.isLastKnownLocation === true) {
        scenarios.add('last_known_position');
      } else if (freshness === 'live') {
        scenarios.add('live_position');
      }
      if (STALE_FRESHNESS.has(freshness)) {
        scenarios.add('stale_position');
      }
    }

    if (isHealthRecord(record.toolName, data)) {
      if (data.limitedData === true) {
        scenarios.add('health_limited');
      } else {
        scenarios.add('health_full');
      }
    }

    if (isOverdueRecord(record.toolName, data) && data.returnOverdue === true) {
      scenarios.add('overdue_return');
    }

    const inconsistencyFlags = data.inconsistencyFlags;
    if (Array.isArray(inconsistencyFlags) && inconsistencyFlags.length > 0) {
      scenarios.add('status_inconsistent');
    }
  }

  if (toolRecords.length > 0 && !sawData) {
    scenarios.add('no_data_not_ok');
  }

  return [...scenarios].sort();
}

export function buildActiveRulesBlock(
  language: 'de' | 'en' | 'unknown',
  scenarios: readonly FleetChatAnswerScenario[],
): string | null {
  if (scenarios.length === 0) {
    return null;
  }

  const useDe = language === 'de';
  const lines = scenarios.map((scenario) => {
    const rule = FLEET_CHAT_SCENARIO_RULE_BY_SCENARIO[scenario];
    return `- ${useDe ? rule.ruleDe : rule.ruleEn}`;
  });

  return `Active scenario rules:\n${lines.join('\n')}`;
}

export function buildFleetChatSystemMessage(
  language: 'de' | 'en' | 'unknown',
  options?: {
    readonly scenarios?: readonly FleetChatAnswerScenario[];
  },
): string {
  const localeHint =
    language === 'de'
      ? 'Antworte auf Deutsch.'
      : language === 'en'
        ? 'Answer in English.'
        : 'Match the user language.';

  const rules =
    options?.scenarios && options.scenarios.length > 0
      ? buildActiveRulesBlock(language, options.scenarios)
      : null;

  return [FLEET_CHAT_POLICY_CORE_PROMPT, localeHint, rules].filter(Boolean).join('\n');
}
