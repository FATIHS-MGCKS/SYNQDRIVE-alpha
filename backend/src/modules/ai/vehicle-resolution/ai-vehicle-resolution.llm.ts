import type { AiVehicleResolutionRecord, AiVehicleResolutionResult } from './ai-vehicle-resolution.types';
import {
  buildAiVehicleDisplayName,
  sanitizeAiVehicleLlmField,
  sanitizeAiVehicleUserText,
} from './ai-vehicle-resolution.hints';
import { toLlmSafeVehicleCandidate } from './ai-vehicle-resolution.matcher';
import { FLEET_CHAT_POLICY_CORE_PROMPT } from '../chat/fleet-chat-policy/fleet-chat-policy.prompt';

export {
  FLEET_CHAT_POLICY_CORE_PROMPT,
  FLEET_CHAT_POLICY_VERSION,
  buildFleetChatSystemMessage,
} from '../chat/fleet-chat-policy';

export function resolveChatVehicleTokenIds(
  resolution: Pick<AiVehicleResolutionResult, 'resolvedVehicleId' | 'allowedDataScope'> | null | undefined,
  fleet: readonly AiVehicleResolutionRecord[],
): number[] | undefined {
  if (!resolution?.resolvedVehicleId || !resolution.allowedDataScope.hasDimoTelemetry) {
    return undefined;
  }

  const vehicle = fleet.find((entry) => entry.vehicleId === resolution.resolvedVehicleId);
  if (!vehicle?.tokenId || vehicle.tokenId <= 0) {
    return undefined;
  }

  return [vehicle.tokenId];
}

export function formatChatScopeLog(
  orgId: string,
  resolution: Pick<AiVehicleResolutionResult, 'resolvedVehicleId' | 'matchType' | 'confidence' | 'ambiguity'> | null,
): string {
  return [
    `orgId=${orgId}`,
    `resolved=${Boolean(resolution?.resolvedVehicleId)}`,
    `matchType=${resolution?.matchType ?? 'none'}`,
    `confidence=${resolution?.confidence ?? 0}`,
    `ambiguous=${Boolean(resolution?.ambiguity.isAmbiguous)}`,
    `candidates=${resolution?.ambiguity.candidates.length ?? 0}`,
  ].join(' ');
}

function formatFleetSummaryLine(
  vehicle: AiVehicleResolutionRecord,
  index: number,
): string {
  const parts = [`#${index + 1}: ${vehicle.make} ${vehicle.model} ${vehicle.year}`];
  if (vehicle.licensePlate) {
    parts.push(`plate="${sanitizeAiVehicleLlmField(vehicle.licensePlate)}"`);
  }
  if (vehicle.vehicleName) {
    parts.push(`name="${sanitizeAiVehicleLlmField(vehicle.vehicleName)}"`);
  }
  parts.push(`fuel=${vehicle.fuelType}`);
  if (!isOperationalLabel(vehicle.status)) {
    parts.push(`status=${vehicle.status}`);
  }
  return parts.join(', ');
}

function isOperationalLabel(status: AiVehicleResolutionRecord['status']): boolean {
  return status !== 'OUT_OF_SERVICE';
}

function buildResolutionHint(resolution: AiVehicleResolutionResult): string {
  if (resolution.ambiguity.isAmbiguous) {
    const options = resolution.ambiguity.candidates
      .map((candidate, index) => {
        const safe = toLlmSafeVehicleCandidate(candidate);
        const platePart = safe.licensePlate ? `, plate: ${safe.licensePlate}` : '';
        return `(${index + 1}) ${safe.label}${platePart}`;
      })
      .join('; ');

    return `\n[System: Multiple fleet vehicles match the user's reference (${resolution.ambiguity.reason}). Candidates: ${options}. Ask the user to clarify which vehicle they mean. Do not guess or invent telemetry.]`;
  }

  if (!resolution.resolvedVehicleId || !resolution.displayName) {
    return '';
  }

  const platePart = resolution.licensePlate
    ? ` (plate: ${sanitizeAiVehicleLlmField(resolution.licensePlate)})`
    : '';
  const operationalPart = resolution.allowedDataScope.operational
    ? ''
    : ' This vehicle is currently out of service — do not assume it is available for rental or live operations.';
  const telemetryPart = resolution.allowedDataScope.hasDimoTelemetry
    ? ''
    : ' This vehicle has no DIMO token — do not claim live DIMO telemetry for it.';
  const scopePart = resolution.allowedDataScope.inStationScope
    ? ''
    : ' This vehicle is outside the operator station scope — treat detailed data as unavailable.';

  return `\n[System: Resolved fleet vehicle "${sanitizeAiVehicleLlmField(resolution.displayName)}"${platePart}.${operationalPart}${telemetryPart}${scopePart} Use this vehicle for the user's question. Do not expose internal ids or full VIN in your answer.]`;
}

export function buildEnrichedChatMessage(
  userMessage: string,
  fleet: readonly AiVehicleResolutionRecord[],
  resolution?: AiVehicleResolutionResult | null,
): string {
  const safeUserMessage = sanitizeAiVehicleUserText(userMessage);
  if (fleet.length === 0) {
    return safeUserMessage;
  }

  const vehicleLines = fleet.map((vehicle, index) => formatFleetSummaryLine(vehicle, index));
  const resolutionHint = buildResolutionHint(
    resolution ?? {
      resolvedVehicleId: null,
      displayName: null,
      licensePlate: null,
      matchType: 'none',
      confidence: 0,
      ambiguity: { isAmbiguous: false, reason: null, candidates: [] },
      allowedDataScope: {
        inOrganization: false,
        inStationScope: false,
        hasDimoTelemetry: false,
        operational: false,
        vehicleStatus: null,
      },
    },
  );

  return `[Fleet context — ${fleet.length} registered vehicles in this organization:
${vehicleLines.join('\n')}
Identify vehicles by license plate, display name, or make/model. Internal ids and VIN values are not listed — do not invent them. Only reference live telemetry when a specific resolved vehicle with DIMO connectivity is confirmed.]${resolutionHint}

User message: ${safeUserMessage}`;
}

/** @deprecated Use `buildFleetChatSystemMessage()` — kept for legacy ChatService imports. */
export const FLEET_CHAT_SYSTEM_PROMPT = FLEET_CHAT_POLICY_CORE_PROMPT;
