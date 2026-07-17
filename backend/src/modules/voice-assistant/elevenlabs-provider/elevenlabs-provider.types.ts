export type ElevenLabsConnectionStatus = 'NOT_CONFIGURED' | 'CONNECTED' | 'DEGRADED';

export type ElevenLabsProviderHealth = {
  configured: boolean;
  reachable: boolean;
  authorized: boolean;
  degraded: boolean;
  healthy: boolean;
  connectionStatus: ElevenLabsConnectionStatus;
  checkedAt: string;
  message?: string;
};

export type ElevenLabsWorkspaceValidation = {
  valid: boolean;
  configured: boolean;
  authorized: boolean;
  convaiAccessible: boolean;
  checkedAt: string;
  message?: string;
};

export type ElevenLabsVoiceView = {
  voiceId: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  previewUrl?: string;
};

export type MaskedElevenLabsAgentView = {
  deploymentId: string;
  maskedAgentRef: string | null;
  name?: string;
  status?: string;
  /** Server-side provisioning reference — never expose to tenant clients. */
  externalAgentId?: string;
};

export type MaskedElevenLabsDeploymentView = {
  deploymentId: string;
  maskedAgentRef: string | null;
  version: number;
  providerVersion?: string | null;
  status?: string;
  activatedVersion?: number | null;
};

export type MaskedElevenLabsPhoneNumberView = {
  phoneNumberId: string;
  maskedPhoneRef: string | null;
  maskedE164?: string | null;
  maskedAssignedAgentRef?: string | null;
};

export type ImportTwilioPhoneNumberResult = {
  controlPlanePhoneNumberId: string;
  elevenLabsPhoneId: string;
  maskedPhoneRef: string | null;
  maskedE164?: string | null;
};

export type OutboundCallPreparation = {
  organizationId: string;
  deploymentId: string;
  phoneNumberId: string;
  maskedToE164: string;
  ready: boolean;
  blockers: string[];
};

export type MaskedOutboundCallView = {
  maskedConversationRef: string | null;
  maskedCallRef: string | null;
  status: string;
};

export type MaskedElevenLabsConversationView = {
  maskedConversationRef: string;
  maskedAgentRef: string | null;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  hasTranscript: boolean;
};

export type PostCallConfigurationInput = {
  webhookUrl?: string | null;
  sendAudio?: boolean;
  analysisEnabled?: boolean;
  enableTranscript?: boolean;
  enableSummary?: boolean;
  enableOutcome?: boolean;
  configVersion?: number;
};

export type MaskedPostCallConfigView = {
  deploymentId: string;
  webhookConfigured: boolean;
  sendAudio?: boolean;
  analysisEnabled?: boolean;
  enableTranscript?: boolean;
  enableSummary?: boolean;
  enableOutcome?: boolean;
  configVersion?: number;
};

export type ToolsConfigurationInput = {
  mcpServerUrl?: string | null;
  toolIds?: string[];
};

export type MaskedToolsConfigView = {
  deploymentId: string;
  mcpConfigured: boolean;
  toolCount: number;
};

export type CreateAgentInput = {
  organizationId: string;
  deploymentId: string;
  name: string;
  systemPrompt: string;
  greetingMessage?: string;
  voiceId?: string;
  language?: string;
};

export type UpdateAgentInput = {
  organizationId: string;
  deploymentId: string;
  name?: string;
  systemPrompt?: string;
  greetingMessage?: string;
  voiceId?: string;
  language?: string;
};

export type ImportTwilioPhoneNumberInput = {
  organizationId: string;
  phoneNumberId: string;
  label?: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  e164: string;
  region?: string;
};

export type TenantAgentRef = {
  organizationId: string;
  deploymentId: string;
  externalAgentId: string;
  maskedExternalRef: string | null;
};

export type TenantPhoneRef = {
  organizationId: string;
  phoneNumberId: string;
  externalPhoneId: string;
  maskedExternalRef: string | null;
  maskedPhoneNumber: string;
};
