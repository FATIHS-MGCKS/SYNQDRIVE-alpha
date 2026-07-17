import type { VoicePermissionMode } from '../voice-assistant-permissions';

export type AgentBusinessHoursDay = {
  day: string;
  open?: string | null;
  close?: string | null;
  closed?: boolean;
};

export type AgentBusinessHours = {
  timezone?: string | null;
  start?: string | null;
  end?: string | null;
  afterHoursMessage?: string | null;
  schedule?: AgentBusinessHoursDay[];
};

export type AgentDynamicVariable = {
  key: string;
  description?: string | null;
  defaultValue?: string | null;
};

export type AgentMcpToolRef = {
  capabilityKey: string;
  mode: VoicePermissionMode;
};

export type AgentKnowledgeRef = {
  refId: string;
  title?: string | null;
  source: 'snippet' | 'document';
};

export type AgentTransferTargetType = 'PHONE' | 'STAFF_USER' | 'STAFF_GROUP' | 'STATION';

/** ElevenLabs native Twilio: `conference` (warm) or `blind` only. */
export type AgentTransferType = 'conference' | 'blind';

export type AgentTransferTarget = {
  type: AgentTransferTargetType;
  phoneE164?: string | null;
  userId?: string | null;
  organizationRoleId?: string | null;
  stationId?: string | null;
};

export type AgentTransferRule = {
  ruleId: string;
  label?: string | null;
  condition: string;
  target: AgentTransferTarget;
  topicKey?: string | null;
  routingStationId?: string | null;
  respectBusinessHours?: boolean;
  maxWaitSeconds?: number | null;
  transferType?: AgentTransferType;
  warmTransferMessage?: string | null;
  failedTransferFallbackMessage?: string | null;
  enabled?: boolean;
};

export type AgentTransferConfig = {
  rules: AgentTransferRule[];
  maxTransferHops?: number;
  loopProtectionEnabled?: boolean;
};

export type AgentFallbackConfig = {
  message?: string | null;
  standardAnnouncement?: string | null;
  escalateOnRequest?: boolean;
  escalateOnLowConfidence?: boolean;
  escalateOnSensitive?: boolean;
  escalationDepartment?: string | null;
  recordCallback?: boolean;
  createSupportCase?: boolean;
  controlledEndCall?: boolean;
  avoidFalseSuccessStatus?: boolean;
  transferFailedMessage?: string | null;
};

export type AgentPrivacyRetention = {
  recordAudio?: boolean;
  storeTranscripts?: boolean;
  retentionAudioDays?: number | null;
  retentionTranscriptDays?: number | null;
  retentionSummaryDays?: number | null;
  retentionProviderPayloadDays?: number | null;
  /** @deprecated use retentionTranscriptDays */
  retentionDays?: number | null;
  redactPii?: boolean;
  redactPiiBeforeLogs?: boolean;
  consentNoticeText?: string | null;
  masterAdminContentAccess?: boolean;
};

export type AgentPostCallConfig = {
  version: number;
  webhookPath: string;
  signatureRequired: boolean;
  webhookSecretConfigured: boolean;
  enableTranscript: boolean;
  enableSummary: boolean;
  enableOutcome: boolean;
  enableAnalysis: boolean;
  sendAudio: boolean;
};

/**
 * Canonical tenant-facing agent configuration — no ElevenLabs provider payloads.
 */
export type CanonicalAgentConfig = {
  assistantName: string;
  systemPrompt: string;
  companyContext?: string | null;
  businessRules?: string | null;
  forbiddenActions?: string | null;
  language: string;
  voiceId?: string | null;
  voiceName?: string | null;
  greeting: string;
  dynamicVariables: AgentDynamicVariable[];
  businessHours?: AgentBusinessHours | null;
  transfer?: AgentTransferConfig | null;
  fallback?: AgentFallbackConfig | null;
  mcpToolRefs: AgentMcpToolRef[];
  knowledgeRefs: AgentKnowledgeRef[];
  privacyRetention: AgentPrivacyRetention;
  postCall: AgentPostCallConfig;
};

export type CanonicalAgentConfigPatch = Partial<
  Omit<
    CanonicalAgentConfig,
    'dynamicVariables' | 'mcpToolRefs' | 'knowledgeRefs' | 'transfer' | 'postCall'
  >
> & {
  dynamicVariables?: AgentDynamicVariable[];
  mcpToolRefs?: AgentMcpToolRef[];
  knowledgeRefs?: AgentKnowledgeRef[];
  transfer?: AgentTransferConfig | null;
  postCall?: Partial<AgentPostCallConfig>;
};

export type AgentDeploymentDraftView = {
  deploymentId: string;
  voiceAssistantId: string;
  config: CanonicalAgentConfig;
  configHash: string;
  updatedAt: string;
};

export type AgentDeploymentDiffEntry = {
  field: string;
  label: string;
  activeValue: string | null;
  draftValue: string | null;
  changed: boolean;
};

export type AgentDeploymentDiffView = {
  hasActiveDeployment: boolean;
  activeVersion: number | null;
  draftDeploymentId: string;
  configHashMatchesActive: boolean;
  changes: AgentDeploymentDiffEntry[];
};

export type AgentDeploymentResultView = {
  deploymentId: string;
  version: number;
  status: string;
  configHash: string;
  maskedExternalRef: string | null;
  jobId: string;
  idempotentReplay: boolean;
};

export type AgentDeploymentRollbackView = {
  deploymentId: string;
  version: number;
  restoredFromVersion: number;
  status: string;
  maskedExternalRef: string | null;
};

export type AgentDeploymentReadinessItem = {
  key: string;
  label: string;
  level: 'blocker' | 'warning';
  message: string;
};

export type AgentDeploymentReadinessView = {
  ready: boolean;
  blockers: AgentDeploymentReadinessItem[];
  warnings: AgentDeploymentReadinessItem[];
};
