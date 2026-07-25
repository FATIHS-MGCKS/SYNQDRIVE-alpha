export const WORKFLOW_RUNTIME_ROLLOUT_STAGE_ENV = 'WORKFLOW_RUNTIME_ROLLOUT_STAGE';
export const WORKFLOW_RUNTIME_ORG_ALLOWLIST_ENV = 'WORKFLOW_RUNTIME_ORG_ALLOWLIST';
export const WORKFLOW_RUNTIME_KILL_SWITCH_ENV = 'WORKFLOW_RUNTIME_KILL_SWITCH';
export const WORKFLOW_RUNTIME_KILL_EMAIL_ENV = 'WORKFLOW_RUNTIME_KILL_EMAIL';
export const WORKFLOW_RUNTIME_KILL_WHATSAPP_ENV = 'WORKFLOW_RUNTIME_KILL_WHATSAPP';
export const WORKFLOW_RUNTIME_KILL_SMS_ENV = 'WORKFLOW_RUNTIME_KILL_SMS';
export const WORKFLOW_RUNTIME_KILL_VOICE_ENV = 'WORKFLOW_RUNTIME_KILL_VOICE';
export const WORKFLOW_RUNTIME_KILL_AI_ENV = 'WORKFLOW_RUNTIME_KILL_AI';
export const WORKFLOW_RUNTIME_KILL_CRITICAL_ENV = 'WORKFLOW_RUNTIME_KILL_CRITICAL';
export const WORKFLOW_RUNTIME_KILL_ACTION_TYPES_ENV = 'WORKFLOW_RUNTIME_KILL_ACTION_TYPES';
export const WORKFLOW_RUNTIME_SHADOW_DEVIATION_THRESHOLD_ENV =
  'WORKFLOW_RUNTIME_SHADOW_DEVIATION_THRESHOLD_PCT';
export const WORKFLOW_RUNTIME_GATE_TESTS_PASS_ENV = 'WORKFLOW_RUNTIME_GATE_TESTS_PASS';
export const WORKFLOW_RUNTIME_MONITORING_ENABLED_ENV = 'WORKFLOW_RUNTIME_MONITORING_ENABLED';

export type WorkflowRuntimeRolloutStage =
  | 'DISABLED'
  | 'SHADOW'
  | 'INTERNAL_ACTIONS_ONLY'
  | 'SELECTED_WORKFLOWS'
  | 'SELECTED_ORGANIZATIONS'
  | 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL'
  | 'GENERAL_AVAILABILITY';

export const WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER: WorkflowRuntimeRolloutStage[] = [
  'DISABLED',
  'SHADOW',
  'INTERNAL_ACTIONS_ONLY',
  'SELECTED_WORKFLOWS',
  'SELECTED_ORGANIZATIONS',
  'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL',
  'GENERAL_AVAILABILITY',
];

export type WorkflowRuntimeBridgeExecutionPath =
  | 'blocked'
  | 'legacy_only'
  | 'shadow_compare'
  | 'workflow_live';

export type WorkflowRuntimeChannelFlag =
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'voice'
  | 'ai'
  | 'critical';

export interface WorkflowRuntimeGlobalRolloutConfig {
  stage: WorkflowRuntimeRolloutStage;
  orgAllowlist: Set<string> | null;
  killSwitchGlobal: boolean;
  killSwitchEmail: boolean;
  killSwitchWhatsapp: boolean;
  killSwitchSms: boolean;
  killSwitchVoice: boolean;
  killSwitchAi: boolean;
  killSwitchCritical: boolean;
  killActionTypes: Set<string>;
  shadowDeviationThresholdPct: number;
  gateTestsPass: boolean;
  monitoringEnabled: boolean;
}

export interface WorkflowRuntimeOrgRolloutSettings {
  stage: WorkflowRuntimeRolloutStage;
  workflowAllowlist: string[];
  killSwitchEnabled: boolean;
  killSwitchEmail: boolean;
  killSwitchWhatsapp: boolean;
  killSwitchSms: boolean;
  killSwitchVoice: boolean;
  killSwitchAi: boolean;
  killSwitchCritical: boolean;
  channelEmailEnabled: boolean;
  channelWhatsappEnabled: boolean;
  channelSmsEnabled: boolean;
  channelVoiceEnabled: boolean;
  channelAiEnabled: boolean;
  criticalActionsEnabled: boolean;
  monitoringAcknowledged: boolean;
}

export interface WorkflowRuntimeEffectiveFlags {
  organizationId: string;
  workflowId?: string;
  globalStage: WorkflowRuntimeRolloutStage;
  orgStage: WorkflowRuntimeRolloutStage;
  effectiveStage: WorkflowRuntimeRolloutStage;
  orgInRolloutAllowlist: boolean;
  workflowInAllowlist: boolean;
  executionPath: WorkflowRuntimeBridgeExecutionPath;
  runShadow: boolean;
  runLiveEngine: boolean;
  runLegacyBridge: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  channelSms: boolean;
  channelVoice: boolean;
  channelAi: boolean;
  criticalActions: boolean;
  killSwitchActive: boolean;
  killSwitchReasons: string[];
  monitoringLinked: boolean;
}

export function isRolloutStageAtLeast(
  current: WorkflowRuntimeRolloutStage,
  minimum: WorkflowRuntimeRolloutStage,
): boolean {
  return (
    WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER.indexOf(current)
    >= WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER.indexOf(minimum)
  );
}

export function parseRolloutStage(raw: string | undefined): WorkflowRuntimeRolloutStage {
  const normalized = raw?.trim().toUpperCase();
  if (
    normalized
    && WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER.includes(normalized as WorkflowRuntimeRolloutStage)
  ) {
    return normalized as WorkflowRuntimeRolloutStage;
  }
  return 'DISABLED';
}

export function requiresMakerCheckerForStage(stage: WorkflowRuntimeRolloutStage): boolean {
  return isRolloutStageAtLeast(stage, 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL');
}
