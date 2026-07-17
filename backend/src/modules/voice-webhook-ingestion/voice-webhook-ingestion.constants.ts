export const VOICE_WEBHOOK_MAX_PAYLOAD_BYTES = 256 * 1024;

export const VOICE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export const VOICE_WEBHOOK_EVENT_TYPES = {
  TWILIO_VOICE_INBOUND: 'twilio.voice.inbound',
  TWILIO_STATUS: 'twilio.voice.status',
  ELEVENLABS_POST_CALL: 'elevenlabs.post_call',
  ELEVENLABS_CONVERSATION: 'elevenlabs.conversation',
  MCP_TOOL_EXECUTION: 'mcp.tool.execution',
  INTERNAL_CONVERSATION: 'internal.conversation',
} as const;

export type VoiceWebhookEventType =
  (typeof VOICE_WEBHOOK_EVENT_TYPES)[keyof typeof VOICE_WEBHOOK_EVENT_TYPES];
