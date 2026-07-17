export type VoiceInboundRoute =
  | 'native_elevenlabs'
  | 'assistant_fallback'
  | 'legacy_diagnostic'
  | 'rejected';

export type VoiceInboundReadinessBlocker = {
  code: string;
  message: string;
};

export type VoiceInboundReadiness = {
  ready: boolean;
  route: VoiceInboundRoute;
  blockers: VoiceInboundReadinessBlocker[];
  organizationId: string;
  voiceAssistantId: string | null;
  phoneNumberId: string | null;
  agentDeploymentId: string | null;
  mcpGatewayConfigured: boolean;
};

export type VoiceOutboundCallRequest = {
  organizationId: string;
  toE164: string;
  idempotencyKey: string;
  customerId?: string | null;
  bookingId?: string | null;
  initiatedByUserId?: string | null;
};

export type VoiceOutboundCallResult = {
  conversationId: string;
  maskedConversationRef: string | null;
  maskedCallRef: string | null;
  status: string;
  dryRun: boolean;
  idempotentReplay: boolean;
};

export type VoiceLegacyDiagnosticCallRequest = {
  organizationId: string;
  toE164: string;
  initiatedByUserId: string;
};
