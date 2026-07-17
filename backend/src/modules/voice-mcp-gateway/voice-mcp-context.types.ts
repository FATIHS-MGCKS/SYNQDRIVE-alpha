import type { VoiceMcpReadOnlyToolName, VoiceMcpToolName, VoiceMcpWriteToolName } from './voice-mcp-gateway.constants';

export type VoiceMcpTokenClaims = {
  organizationId: string;
  voiceAssistantId: string;
  agentDeploymentId: string;
  conversationId: string;
  allowedTools: VoiceMcpToolName[];
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  audience?: string | null;
};

export type VoiceMcpRequestContext = VoiceMcpTokenClaims & {
  requestId: string;
  correlationId: string;
  callerPhoneE164?: string | null;
};

export type VoiceMcpToolCallInput = {
  name: VoiceMcpToolName;
  arguments: Record<string, unknown>;
};
