import type { VoiceAssistant } from '@prisma/client';
import {
  resolveToolPermissions,
  VoicePermissionMode,
} from '@modules/voice-assistant/voice-assistant-permissions';
import { VOICE_MCP_TOOL_REGISTRY } from '@modules/voice-mcp-gateway/voice-mcp-tools.registry';
import type { VoiceMcpToolName } from '@modules/voice-mcp-gateway/voice-mcp-gateway.constants';

export function resolveAllowedMcpToolsForAssistant(assistant: VoiceAssistant): VoiceMcpToolName[] {
  const permissions = resolveToolPermissions(assistant);
  return VOICE_MCP_TOOL_REGISTRY.filter((tool) => {
    const mode = permissions[tool.capabilityKey];
    return Boolean(mode && mode !== VoicePermissionMode.DISABLED);
  }).map((tool) => tool.name);
}
