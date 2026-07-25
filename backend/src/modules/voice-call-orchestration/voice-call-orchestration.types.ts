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
  workflowSource?: VoiceWorkflowCallSource;
};

export type VoiceWorkflowCallSource = {
  workflowRunId: string;
  actionRunId: string;
  workflowId: string;
  actionIndex: number;
  scenarioKey: string;
  scenarioVersion: string;
  callPurpose: string;
  maxDurationSeconds?: number;
  toolAllowlist?: string[];
  aiTransparencyRequired?: boolean;
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
