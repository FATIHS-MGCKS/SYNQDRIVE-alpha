export const VOICE_MCP_GATEWAY_PATH = '/api/v1/mcp/voice';

export const VOICE_MCP_TOKEN_TYPE = 'voice_mcp';

export const VOICE_MCP_PROTOCOL_VERSION = '2024-11-05';

export const VOICE_MCP_SERVER_NAME = 'synqdrive-voice';

export const VOICE_MCP_SERVER_VERSION = '1.0.0';

export const VOICE_MCP_DEFAULT_TOKEN_TTL_SECONDS = 900;

export const VOICE_MCP_DEFAULT_TOOL_TIMEOUT_MS = 10_000;

export const VOICE_MCP_DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

export const VOICE_MCP_REQUEST_ID_HEADER = 'x-request-id';

export const VOICE_MCP_CORRELATION_ID_HEADER = 'x-correlation-id';

export const VOICE_MCP_READ_ONLY_TOOLS = [
  'identify_customer',
  'get_customer_summary',
  'find_booking',
  'get_booking_status',
  'get_vehicle_status',
  'get_invoice_status',
  'get_branch_information',
  'get_business_hours',
] as const;

export type VoiceMcpReadOnlyToolName = (typeof VOICE_MCP_READ_ONLY_TOOLS)[number];
