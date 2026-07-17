import type { VoiceToolRiskClass } from '@prisma/client';
import type { VoiceMcpToolName, VoiceMcpWriteToolName } from './voice-mcp-gateway.constants';
import { VOICE_MCP_PROHIBITED_TOOLS, VOICE_MCP_READ_ONLY_TOOLS, VOICE_MCP_WRITE_TOOLS } from './voice-mcp-gateway.constants';

const WRITE_TOOL_RISK: Record<VoiceMcpWriteToolName, VoiceToolRiskClass> = {
  create_callback_request: 'CONFIRMATION_REQUIRED',
  request_document_resend: 'CONFIRMATION_REQUIRED',
  create_support_case: 'STAFF_APPROVAL_REQUIRED',
  create_task: 'STAFF_APPROVAL_REQUIRED',
  create_customer_note: 'STAFF_APPROVAL_REQUIRED',
  request_booking_change: 'STAFF_APPROVAL_REQUIRED',
};

export function isProhibitedMcpTool(name: string): boolean {
  return (VOICE_MCP_PROHIBITED_TOOLS as readonly string[]).includes(name);
}

export function isReadOnlyMcpTool(name: string): name is (typeof VOICE_MCP_READ_ONLY_TOOLS)[number] {
  return (VOICE_MCP_READ_ONLY_TOOLS as readonly string[]).includes(name);
}

export function isWriteMcpTool(name: string): name is VoiceMcpWriteToolName {
  return (VOICE_MCP_WRITE_TOOLS as readonly string[]).includes(name);
}

export function getMcpToolRiskClass(name: VoiceMcpToolName): VoiceToolRiskClass {
  if (isReadOnlyMcpTool(name)) {
    return 'READ_ONLY';
  }
  if (isWriteMcpTool(name)) {
    return WRITE_TOOL_RISK[name];
  }
  return 'PROHIBITED';
}
