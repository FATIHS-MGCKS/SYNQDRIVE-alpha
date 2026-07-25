import { sanitizeAiVehicleUserText } from '../vehicle-resolution/ai-vehicle-resolution.hints';
import type { FleetChatSecurityFlag } from './fleet-chat-intent.enums';

const INJECTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bignore\s+(all\s+)?(previous|prior)\s+instructions\b/i, label: 'ignore_instructions' },
  { pattern: /\bdisregard\s+(all\s+)?(previous|prior)\s+instructions\b/i, label: 'disregard_instructions' },
  { pattern: /\byou\s+are\s+now\b/i, label: 'you_are_now' },
  { pattern: /\bsystem\s*prompt\b/i, label: 'system_prompt' },
  { pattern: /\bact\s+as\s+(a\s+)?(?:different|new)\b/i, label: 'act_as' },
  { pattern: /\bdeveloper\s+mode\b/i, label: 'developer_mode' },
  { pattern: /\bjailbreak\b/i, label: 'jailbreak' },
  { pattern: /\bdo\s+not\s+follow\b/i, label: 'do_not_follow' },
  { pattern: /\boverride\s+(?:safety|security|policy)\b/i, label: 'override_policy' },
  { pattern: /\bexecute\s+tool\b/i, label: 'execute_tool' },
  { pattern: /\brun\s+tool\s+get_/i, label: 'run_tool_get' },
];

const TOOL_NAME_PATTERN =
  /\b(?:get_vehicle_location|get_vehicle_telemetry_status|get_vehicle_health_summary|explain_overdue_return|get_vehicle_booking_context)\b/gi;

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function stripToolNamesForIntentScoring(message: string): string {
  return message.replace(TOOL_NAME_PATTERN, '[tool]');
}

export interface FleetChatSecurityScanResult {
  readonly flags: readonly FleetChatSecurityFlag[];
  readonly injectionLabels: readonly string[];
  readonly toolNamesInText: readonly string[];
  readonly uuidsInText: readonly string[];
}

export function scanFleetChatSecurity(input: {
  readonly message: string;
  readonly resolvedVehicleId: string | null;
  readonly internalVehicleIdInText: string | null;
  readonly vehicleAmbiguous: boolean;
  readonly multipleVehicleHints: boolean;
}): FleetChatSecurityScanResult {
  const sanitized = sanitizeAiVehicleUserText(input.message);
  const flags = new Set<FleetChatSecurityFlag>();
  const injectionLabels: string[] = [];
  const toolNamesInText: string[] = [];

  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      injectionLabels.push(label);
      flags.add('prompt_injection_attempt');
    }
  }

  const toolMatches = sanitized.match(TOOL_NAME_PATTERN);
  if (toolMatches) {
    for (const match of toolMatches) {
      toolNamesInText.push(match.toLowerCase());
      flags.add('tool_name_in_user_text');
    }
  }

  const uuids = [...sanitized.matchAll(UUID_PATTERN)].map((m) => m[0].toLowerCase());
  if (uuids.length > 0) {
    flags.add('suspicious_identifier_in_text');
    if (
      input.internalVehicleIdInText &&
      !input.resolvedVehicleId &&
      !input.vehicleAmbiguous
    ) {
      flags.add('vehicle_not_in_tenant');
    }
  }

  if (input.vehicleAmbiguous) {
    flags.add('vehicle_resolution_ambiguous');
  }

  if (input.multipleVehicleHints) {
    flags.add('multiple_vehicle_references');
  }

  return {
    flags: [...flags],
    injectionLabels,
    toolNamesInText,
    uuidsInText: uuids,
  };
}
