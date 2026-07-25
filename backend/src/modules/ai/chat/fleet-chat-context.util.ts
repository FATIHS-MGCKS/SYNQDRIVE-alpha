import type { AiVehicleResolutionRecord } from '../vehicle-resolution/ai-vehicle-resolution.types';
import {
  buildEnrichedChatMessage,
  FLEET_CHAT_SYSTEM_PROMPT,
  formatChatScopeLog,
  normalizePlate,
  resolveAiVehicleFromMessage,
  resolveChatVehicleTokenIds,
} from '../vehicle-resolution';

export type FleetVehicleInfo = AiVehicleResolutionRecord;

export {
  buildEnrichedChatMessage,
  FLEET_CHAT_SYSTEM_PROMPT,
  formatChatScopeLog,
  normalizePlate,
  resolveChatVehicleTokenIds,
};

/** @deprecated Use resolveAiVehicleFromMessage — kept for legacy imports */
export function tryResolveVehicle(
  message: string,
  fleet: AiVehicleResolutionRecord[],
): AiVehicleResolutionRecord | null {
  const organizationId = fleet[0]?.organizationId;
  if (!organizationId) {
    return null;
  }

  const resolution = resolveAiVehicleFromMessage({
    organizationId,
    message,
    fleet,
  });

  if (!resolution.resolvedVehicleId) {
    return null;
  }

  return fleet.find((vehicle) => vehicle.vehicleId === resolution.resolvedVehicleId) ?? null;
}
