import { resolveVoicePublicBaseUrl } from '@modules/voice-assistant/agent-deployment/agent-post-call.config';
import { VOICE_MCP_GATEWAY_PATH } from './voice-mcp-gateway.constants';

export function buildCanonicalVoiceMcpGatewayPath(organizationId: string): string {
  return `${VOICE_MCP_GATEWAY_PATH}/${organizationId}`;
}

export function buildCanonicalVoiceMcpGatewayUrl(organizationId: string): string | null {
  const base = resolveVoicePublicBaseUrl();
  if (!base) {
    return null;
  }
  return `${base}${buildCanonicalVoiceMcpGatewayPath(organizationId)}`;
}
