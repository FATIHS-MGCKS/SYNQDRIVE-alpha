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

export type AgentFallbackConfig = {
  message?: string | null;
  escalateOnRequest?: boolean;
  escalateOnLowConfidence?: boolean;
  escalateOnSensitive?: boolean;
  escalationDepartment?: string | null;
};

export type AgentPrivacyRetention = {
  storeTranscripts?: boolean;
  retentionDays?: number | null;
  redactPii?: boolean;
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
  fallback?: AgentFallbackConfig | null;
  mcpToolRefs: AgentMcpToolRef[];
  knowledgeRefs: AgentKnowledgeRef[];
  privacyRetention: AgentPrivacyRetention;
};

export type CanonicalAgentConfigPatch = Partial<
  Omit<CanonicalAgentConfig, 'dynamicVariables' | 'mcpToolRefs' | 'knowledgeRefs'>
> & {
  dynamicVariables?: AgentDynamicVariable[];
  mcpToolRefs?: AgentMcpToolRef[];
  knowledgeRefs?: AgentKnowledgeRef[];
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
